import {InputGroupCall} from '../../layer';
import {DcId} from '../../types';
import {RTMP_UNIFIED_CHANNEL_ID, RTMP_UNIFIED_QUALITY} from '../calls/constants';
import {parseVideoStreamInfo} from '../calls/videoStreamInfo';
import {Fmp4InitChunkInfo, generateFmp4Init, generateFmp4Segment} from '../rtmp/fmp4';
import ISOBoxer from '../rtmp/isoboxer';
import {serviceMessagePort} from './index.service';
import {log} from './index.service'
import bigInt from 'big-integer';
import {IS_SAFARI} from '../../environment/userAgent';
import type {OpusDecodedAudio} from '../../vendor/opus';
import {OpusDecoder} from '../../vendor/opus';
import {notifyAll} from '../../helpers/context';

const pendingStreams: Map<string, RtmpStream> = new Map();
// сафари воистину конченный браузер - перезагружает плейлист даже после ENDLIST
// костыль чтобы не было проблем с перезагрузкой мертвого стрима
const lastKnownTime = new Map<Long, bigInt.BigInteger>();

const BUFFER_MS = 5000;

// seconds to consider stream to be still alive when using hls
// (since the last time manifest was requested)
const HLS_TIMEOUT = 30000;
// seconds to consider stream to be still alive when using fmp4 streaming
// (since the last controller has died)
const STREAM_TIMEOUT = 5000;

const MP4_MIME = 'video/mp4';
const HLS_MIME = 'application/vnd.apple.mpegurl';

function scaleToTime(scale: number) {
  if(scale < 0) return 1000 << -scale;
  return 1000 >> scale;
}

// todo pings with page to keep alive because apparently handling stream end isnt enough?

interface BufferedChunk {
  time: bigInt.BigInteger
  seq: number
  segment?: Uint8Array
}
type HlsWaiter = (chunk?: Uint8Array) => void

class RtmpStream {
  private _generation = 0
  private _retryCount = 0
  private _destroyed = false


  private _controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private _waitingForBuffer = new Set<ReadableStreamDefaultController<Uint8Array>>();

  private _timeout?: NodeJS.Timeout

  private _hlsWaitingForBuffer: HlsWaiter[] = []
  private _hlsWaitingForChunk = new Map<number, HlsWaiter[]>()
  private _pendingRejects: ((error: any) => void)[] = []

  private _opusDecoder?: OpusDecoder

  private _time: bigInt.BigInteger
  private _cutoff: bigInt.BigInteger
  private _lastTime: bigInt.BigInteger = bigInt.zero

  private _scale: number
  private _chunkTime = 0
  private _buffer: BufferedChunk[] = []
  private _bufferSize = 0
  private _dcId: DcId

  private _clock: NodeJS.Timeout

  private _initChunk?: Fmp4InitChunkInfo
  private _lastChunkSeq = 0

  private _isAhead = false

  constructor(readonly call: InputGroupCall) {
    this._decodeOpus = this._decodeOpus.bind(this)
  }

  private async _fetchChunk(time: bigInt.BigInteger, seq: number) {
    if(time.isNegative()) {
      // chunk does not exist (e.g. stream has just started)
      return new Uint8Array(0);
    }
    if(time.lesserOrEquals(this._lastTime)) {
      // this chunk was already fetched, likely due to resync
      return new Uint8Array(0);
    }

    log('starting fetch', this.call.id, time.toString())
    const chunk = await serviceMessagePort.invoke('requestRtmpPart', {
      dcId: this._dcId,
      request: {
        _: 'inputGroupCallStream',
        call: this.call,
        time_ms: time.toString(),
        scale: this._scale,
        video_channel: RTMP_UNIFIED_CHANNEL_ID,
        video_quality: RTMP_UNIFIED_QUALITY
      }
    })

    if(chunk._ !== 'upload.file') {
      throw new Error('Invalid file');
    }

    // empty chunk (e.g. stream has just started)
    if(!chunk.bytes.length) return chunk.bytes;

    const info = parseVideoStreamInfo(chunk.bytes);
    if(info.container !== 'mp4') {
      throw new Error('Invalid container');
    }

    // todo avoid copies
    const iso = ISOBoxer.parseBuffer(chunk.bytes.slice(info.contentOffset).buffer);
    const isInitChunk = this._initChunk === undefined;
    if(!this._initChunk) {
      this._initChunk = generateFmp4Init(iso, {
        opusToFlac: IS_SAFARI
      })
      if(this._initChunk.opusInitOptions) {
        await this._initOpusDecoder()
      }
    }
    const segment = await generateFmp4Segment({
      chunk: iso,
      seq: seq,
      timestamp: bigInt(seq).multiply(this._chunkTime),
      opusTrackId: this._initChunk.opusTrackId,
      decodeOpus: IS_SAFARI && this._decodeOpus
    })
    log(`ended fetch call=${this.call.id} time=${time} seq=${seq}`)
    if(isInitChunk) this._retryCount = 0
    return segment
  }

  private _decoderInitPromise?: Promise<void>
  private async _initOpusDecoder(ignoreExisting = false) {
    if(this._decoderInitPromise) {
      await this._decoderInitPromise
      return
    }

    log('creating opus decoder', this.call.id)
    if(this._opusDecoder !== undefined && !ignoreExisting) {
      this._opusDecoder.free()
    }
    const decoder = new OpusDecoder(this._initChunk.opusInitOptions)
    this._decoderInitPromise = decoder.ready
    await this._decoderInitPromise
    this._opusDecoder = decoder
    log('opus decoder created', this.call.id)
  }

  private async _decodeOpus(chunk: Uint8Array): Promise<OpusDecodedAudio> {
    if(this._opusDecoder === undefined) {
      await this._initOpusDecoder()
    }

    return this._opusDecoder.decodeFrame(chunk)
  }

  private _hasEnoughBuffer() {
    return this._initChunk && this._bufferSize && this._buffer.length >= this._bufferSize;
  }

  private _sendBufferToController(controller: ReadableStreamDefaultController<Uint8Array>) {
    log('sending buffer to controller', this.call.id)
    controller.enqueue(this._initChunk.data);
    for(const chunk of this._buffer) {
      if(!chunk.segment) break
      controller.enqueue(chunk.segment);
    }
  }

  private _removeStaleChunks() {
    while(this._buffer.length && this._buffer[0].time.lt(this._cutoff)) {
      this._buffer.shift();
    }
  }

  private _pendingReplenish = false;
  private async _replenishBuffer() {
    this._removeStaleChunks();

    const thisGeneration = this._generation;

    // fetch upcoming chunks
    const chunksToFetch = this._bufferSize - this._buffer.length;
    if(!chunksToFetch) {
      log('skipping replenish - buffer full', this.call.id)
      return;
    }

    if(this._pendingReplenish) {
      log('skipping replenish - already pending', this.call.id)
      return;
    }
    this._pendingReplenish = true;
    log('replenishing buffer', this.call.id, chunksToFetch)

    const lastBufferedChunkTime = this._buffer.length ?
      this._buffer[this._buffer.length - 1].time :
      this._cutoff;
    const lastSeq = this._lastChunkSeq;

    const tasks: Promise<BufferedChunk>[] = [];
    let isAhead = false;
    let aheadMinTime: bigInt.BigInteger;

    for(let i = 1; i <= chunksToFetch; i++) {
      const nextTime = lastBufferedChunkTime.add(this._chunkTime * i);
      const nextSeq = this._lastChunkSeq++
      const chunk: BufferedChunk = {time: nextTime, seq: nextSeq}
      this._buffer.push(chunk);

      tasks.push((async() => {
        try {
          chunk.segment = await this._fetchChunk(nextTime, nextSeq);
        } catch(e: any) {
          if(e.type === 'TIME_TOO_BIG') {
            isAhead = true
            if(!aheadMinTime || nextTime.lt(aheadMinTime)) {
              aheadMinTime = nextTime
            }
          } else {
            throw e
          }
        }
        return chunk;
      })())
    }

    let newChunks = await Promise.all(tasks);

    if(this._destroyed || this._generation !== thisGeneration) return; // resync happened while we were fetching
    if(!this._initChunk) {
      // we're still waiting for init chunk. may happen if we have connected at the very beginning of the stream
      log('skipping flush - no init chunk', this.call.id)
      this._pendingReplenish = false;
      return;
    }

    if(isAhead) {
      log(`rtmp stream too far ahead ${this.call.id} next_time=${aheadMinTime}`)
      this._isAhead = true;
      this._time = aheadMinTime;
      this._cutoff = aheadMinTime.minus(BUFFER_MS);
      this._pendingReplenish = false;
      this._lastChunkSeq = lastSeq

      // remove the empty "ahead" chunks
      const aheadIdx = this._buffer.findIndex(it => it.time.geq(aheadMinTime))
      if(aheadIdx !== -1) {
        this._buffer.splice(aheadIdx)
      }

      this._notifyTime()
      return;
    }

    // remove any chunks that are now too old
    newChunks = newChunks.filter(it => it.time.geq(this._cutoff))
    if(newChunks.length === 0) {
      log('skipping flush - no new chunks', this.call.id)
      this._pendingReplenish = false;
      return;
    }

    this._lastTime = newChunks[newChunks.length - 1].time;
    this._isAhead = false;

    if(IS_SAFARI) {
      // notify pending manifests
      for(const waiter of this._hlsWaitingForBuffer) {
        waiter();
      }
      this._hlsWaitingForBuffer.length = 0;

      // notify pending chunks
      for(const chunk of newChunks) {
        const waiters = this._hlsWaitingForChunk.get(chunk.seq) || [];
        this._hlsWaitingForChunk.delete(chunk.seq);

        for(const waiter of waiters) {
          waiter(chunk.segment);
        }
      }
    } else {
      // notify active controllers
      for(const controller of this._controllers) {
        for(const chunk of newChunks) {
          log(`sending chunk to controller call=${this.call.id} time=${chunk.time} seq=${chunk.seq}`)
          controller.enqueue(chunk.segment);
        }
      }

      // notify new controllers and move them from waiting to active
      for(const controller of this._waitingForBuffer) {
        this._sendBufferToController(controller);
        this._controllers.add(controller);
      }
      this._waitingForBuffer.clear();
    }

    log('buffer replenished', this.call.id, this._buffer.length)
    this._pendingReplenish = false;
  }

  private async _start(): Promise<void> {
    log(`starting rtmp stream ${this.call.id} generation ${this._generation} -> ${this._generation + 1}`)
    clearInterval(this._clock)
    this._initChunk = undefined
    this._lastChunkSeq = 0
    this._buffer = []
    this._pendingReplenish = false
    this._isAhead = false
    this._generation += 1

    const state = await serviceMessagePort.invoke('requestRtmpState', this.call);
    if(this._destroyed) return;
    // if(!state.channels.length && this._retryCount <= 3) {
    //   log('retrying rtmp stream (no channels found)', this.call.id)
    //   this._retryCount += 1
    //   return this._start()
    // }

    const channel = state.channels.find(channel => channel.channel === RTMP_UNIFIED_CHANNEL_ID);
    if(!channel) {
      // if(this._retryCount <= 3) {
      //   log('retrying rtmp stream (no unified channel found)', this.call.id)
      //   this._retryCount += 1
      //   return this._start()
      // }
      throw new Error('No unified channel found');
    }

    log(`rtmp stream started, last_ts=${channel.last_timestamp_ms}, scale=${channel.scale}`)
    this._time = bigInt(channel.last_timestamp_ms as number);
    if(IS_SAFARI) {
      const lastKnown = lastKnownTime.get(this.call.id);
      if(lastKnown && lastKnown.gt(this._time)) {
        this._time = lastKnown
      }
    }

    this._cutoff = this._time.minus(BUFFER_MS);
    this._scale = channel.scale;
    this._chunkTime = scaleToTime(this._scale);
    this._bufferSize = Math.ceil(BUFFER_MS / this._chunkTime);
    this._dcId = state.dcId;

    this._notifyTime()

    this._clock = setInterval(() => {
      if(this._destroyed) clearInterval(this._clock); // just in case

      if(!this._isAhead) {
        this._time = this._time.add(this._chunkTime);
        this._cutoff = this._cutoff.add(this._chunkTime);
        this._notifyTime()
      }
      log('rtmp stream tick', this.call.id, this._time)

      this._replenishBuffer().catch(e => {
        if(this._destroyed) return

        log('error replenishing buffer', this.call.id, e)
        this._pendingReplenish = false;

        // if there's still some buffer, we can ignore this error and keep going
        if(!this._buffer.some(it => it.segment) || this._isAhead) {
          this._handleError(e);
        }
      })
    }, this._chunkTime)

    await this._replenishBuffer();
  }

  start() {
    this._start().catch((e: unknown) => this._handleError(e))
  }

  private _notifyTime() {
    if(IS_SAFARI) {
      lastKnownTime.set(this.call.id, this._time)
    }
    notifyAll({
      type: 'pong', // костыль - совместимость с superMessagePort
      _type: 'rtmpStreamTime',
      callId: this.call.id,
      time: this._time.toString()
    })
  }

  /**
   * @returns  whether the request should be retried
   */
  private _handleError(error: any): boolean {
    if(this._destroyed) return false

    if(typeof error === 'object' && error && typeof error.type === 'string') {
      // is ApiError
      if(error.type.startsWith('FLOOD_WAIT_') ||
        error.type === 'TIME_TOO_SMALL' ||
        error.type === 'TIME_INVALID'
      ) {
        log('rtmp stream need resync', this.call.id, error)
        this.start()
        return true
      }

      if((
        error.type === 'GROUPCALL_FORBIDDEN' ||
        error.type === 'VIDEO_CHANNEL_INVALID'
      ) && this._retryCount < 3) {
        log('retrying rtmp stream', this.call.id, error)
        this._retryCount += 1
        this.start()
        return true
      }
    }

    log('rtmp stream error', this.call.id, error)
    this.destroy(error)
  }

  destroy(error = new Error('destroyed')) {
    log('destroying rtmp stream', this.call.id, error)
    pendingStreams.delete(this.call.id as string);
    clearInterval(this._clock);
    clearTimeout(this._timeout);
    if(this._opusDecoder !== undefined) {
      this._opusDecoder.free()
    }
    for(const controller of this._controllers) {
      controller.close();
    }
    for(const controller of this._waitingForBuffer) {
      controller.close();
    }
    for(const reject of this._pendingRejects) {
      reject(error);
    }
    this._destroyed = true;
    this._generation = 0;

    if(IS_SAFARI) {
      notifyAll({
        type: 'pong', // костыль - совместимость с superMessagePort
        _type: 'rtmpStreamDestroyed',
        callId: this.call.id
      })
    }
  }

  createStream() {
    let controller_: ReadableStreamDefaultController;
    return new ReadableStream({
      start: (controller) => {
        log(`added rtmp stream controller call=${this.call.id} gen=${this._generation} destroyed=${this._destroyed}`)
        controller_ = controller;

        if(this._generation === 0) {
          this.start();
        }

        if(this._timeout) {
          clearTimeout(this._timeout);
        }

        if(this._hasEnoughBuffer()) {
          this._sendBufferToController(controller);
          this._controllers.add(controller);
        } else {
          this._waitingForBuffer.add(controller);
        }
      },
      cancel: () => {
        if(this._destroyed) return;
        log('rtmp stream controller died', this.call.id)
        this._controllers.delete(controller_);
        this._waitingForBuffer.delete(controller_);

        if(!this._controllers.size) {
          this._timeout = setTimeout(() => {
            this.destroy();
          }, STREAM_TIMEOUT);
        }
      }
    })
  }

  private _generateHlsPlaylist(baseUrl: string, end = false) {
    const chunkDuration = this._chunkTime / 1000
    const playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      `#EXT-X-TARGETDURATION:${Math.ceil(chunkDuration)}`,
      `#EXT-X-MEDIA-SEQUENCE:${this._buffer[0]?.seq ?? 0}`,
      '#EXT-X-INDEPENDENT-SEGMENTS',
      `#EXT-X-MAP:URI="${baseUrl}?hls=init"`
    ]

    for(const chunk of this._buffer) {
      if(!chunk.segment) break;
      playlist.push(
        `#EXTINF:${chunkDuration},`,
        `${baseUrl}?hls=${chunk.seq}`
      );
    }

    if(end) {
      playlist.push('#EXT-X-ENDLIST');
    }

    return playlist.join('\n');
  }

  private _onHlsTimeout = () => {
    log('hls playlist refetch timeout', this.call.id)
    if(this._hlsWaitingForBuffer.length || this._hlsWaitingForChunk.size) {
      log('still active (some fetch is pending)')
      this._timeout = setTimeout(this._onHlsTimeout, HLS_TIMEOUT);
      return
    }

    log('destroying due to inactivity')
    this.destroy();
  }

  async getHlsPlaylist(baseUrl: string): Promise<string> {
    log('getting hls playlist', this.call.id)

    if(this._timeout) {
      clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(this._onHlsTimeout, HLS_TIMEOUT);

    if(this._generation === 0) {
      this.start();
    }

    if(this._hasEnoughBuffer()) {
      return this._generateHlsPlaylist(baseUrl);
    }

    return new Promise<string>((resolve) => {
      const reject = (err: unknown) => {
        log('hls playlist fetch error, returning empty+end', this.call.id, err)
        resolve(this._generateHlsPlaylist(baseUrl, true));
      }
      this._pendingRejects.push(reject);
      this._hlsWaitingForBuffer.push(() => {
        const idx = this._pendingRejects.indexOf(reject);
        if(idx !== -1) {
          this._pendingRejects.splice(idx, 1);
        }

        resolve(this._generateHlsPlaylist(baseUrl));
      });
    })
  }

  getInitChunk() {
    return this._initChunk?.data;
  }

  async getHlsChunk(seq: number): Promise<Uint8Array | null> {
    log('getting hls chunk', this.call.id, seq)

    const chunk = this._buffer.find(chunk => chunk.seq === seq);

    if(chunk && chunk.segment) return chunk.segment;

    // either we're not ready yet or the chunk is too old
    if(this._buffer.length && seq < this._buffer[0].seq) {
      log('hls chunk to old', this.call.id, seq)
      log(this._buffer)
      return null
    }

    return new Promise<Uint8Array>((resolve, reject) => {
      const interval = setInterval(() => {
        if(this._buffer.length && seq < this._buffer[0].seq) {
          // chunk is now too old
          log('hls chunk fetch timeout', this.call.id, seq)
          resolve(null);
        }
      }, this._chunkTime ?? 500);
      const rejectWrap = (err: unknown) => {
        clearInterval(interval);
        reject(err);
      }

      const waiters = this._hlsWaitingForChunk.get(seq) || [];

      waiters.push((chunk) => {
        const idx = this._pendingRejects.indexOf(rejectWrap);
        if(idx !== -1) {
          this._pendingRejects.splice(idx, 1);
        }

        clearInterval(interval);
        resolve(chunk);
      });
      this._pendingRejects.push(rejectWrap);

      this._hlsWaitingForChunk.set(seq, waiters);
    })
  }
}

export function onRtmpFetch(event: FetchEvent, params: string, search: string) {
  const call = JSON.parse(decodeURIComponent(params));
  let pending = pendingStreams.get(call.id);

  if(!pending) {
    log('creating rtmp stream', call.id)
    pending = new RtmpStream(call);
    pendingStreams.set(call.id, pending);
  }

  if(search?.startsWith('hls=')) {
    search = search.split('&t=')[0];
    console.log(search)
    const baseUrl = event.request.url.split('?')[0];
    const chunk = search.slice(4);

    if(chunk === 'playlist') {
      return event.respondWith(pending.getHlsPlaylist(baseUrl).then((r) => new Response(r, {
        headers: {
          'Content-Type': HLS_MIME
        }
      })));
    }

    if(chunk === 'init') {
      const init = pending.getInitChunk();

      if(!init) {
        event.respondWith(new Response('', {status: 404}))
      }

      return event.respondWith(new Response(init, {
        headers: {
          'Content-Type': MP4_MIME
        }
      }));
    }

    const seq = Number(chunk);
    if(isNaN(seq)) {
      return event.respondWith(new Response('', {status: 404}))
    }

    return event.respondWith(pending.getHlsChunk(seq).then((r) => {
      if(!r) {
        return new Response('', {status: 404})
      }

      return new Response(r, {
        headers: {
          'Content-Type': MP4_MIME
        }
      })
    }));
  }

  event.respondWith(new Response(pending.createStream(), {
    headers: {
      'Content-Type': 'video/mp4'
    }
  }))
}


export function onRtmpLeftCall([callId, forever]: [Long, boolean]) {
  const stream = pendingStreams.get(callId + '');
  if(stream) {
    stream.destroy();
  }
  if(IS_SAFARI && forever) {
    lastKnownTime.delete(callId);
  }
}
