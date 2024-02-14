import {IS_SAFARI} from '../environment/userAgent';
import {copyTextToClipboard} from '../helpers/clipboard';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import {videoToImage} from '../helpers/dom/videoToImage';
import ListLoader from '../helpers/listLoader';
import ListenerSetter from '../helpers/listenerSetter';
import {rtmpCallsController} from '../lib/calls/rtmpCallsController';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import {getRtmpShareUrl, getRtmpStreamUrl} from '../lib/rtmp/url';
import AppMediaViewerBase from './appMediaViewerBase';
import {RtmpStartStreamPopup} from './groupCall/rtmp/adminPopup';
import {OutputDevicePopup} from './groupCall/rtmp/outputDevicePopup';
import {RtmpRecordPopup} from './groupCall/rtmp/recordPopup';
import PopupElement from './popups';
import SetTransition from './singleTransition';
import {toastNew} from './toast';


export class AppMediaViewerRtmp extends AppMediaViewerBase<never, 'forward', never> {
  static activeInstance: AppMediaViewerRtmp | null = null
  static previousPeerId: PeerId | null = null
  static previousCapture: string | null = null

  private _peerId: PeerId
  private _listenerSetter = new ListenerSetter()
  private _retryTimeout?: NodeJS.Timeout
  constructor() {
    super(new ListLoader({
      loadMore: async() => {
        return {
          count: 0,
          items: []
        }
      }
    }), ['forward'])

    this._onForward = this._onForward.bind(this)

    this.setBtnMenuToggle([
      {
        icon: 'forward',
        text: 'Forward',
        onClick: this._onForward
      }
    ])

    this.buttons.download.classList.add('hide')
    this.buttons.zoomin.classList.add('hide')

    this.wholeDiv.classList.add('live')

    this.setListeners()
  }

  protected setListeners() {
    super.setListeners()

    attachClickEvent(this.buttons.forward, this._onForward);

    this._listenerSetter.add(navigator.serviceWorker)('message', (e) => {
      if(e.data._type === 'rtmpStreamTime' && e.data.callId === rtmpCallsController.currentCall?.call.id) {
        rtmpCallsController.currentCall.lastKnownTime = e.data.time
      }
      if(e.data._type === 'rtmpStreamDestroyed' && e.data.callId === rtmpCallsController.currentCall?.call.id && this.videoPlayer.video) {
        this.retryLoadStream(this.videoPlayer.video);
      }
    })
  }

  private _onForward() {
    const url = getRtmpShareUrl(this._peerId)
    copyTextToClipboard(url)
    toastNew({
      langPackKey: 'LinkCopied'
    })
  }

  async openMedia(params: {
    peerId: PeerId,
    isAdmin: boolean,
  }) {
    if(!rtmpCallsController.currentCall || rtmpCallsController.currentCall.peerId !== params.peerId) {
      if(rtmpCallsController.currentCall) {
        await rtmpCallsController.leaveCall()
      }

      await rtmpCallsController.joinCall(params.peerId.toChatId())
    }

    AppMediaViewerRtmp.activeInstance = this
    this._peerId = params.peerId

    await this._openMedia({
      isAdmin: params.isAdmin,
      media: rtmpCallsController.currentCall.inputCall,
      mediaThumbnail: params.peerId === AppMediaViewerRtmp.previousPeerId ? AppMediaViewerRtmp.previousCapture : undefined,
      timestamp: 0,
      fromId: params.peerId,
      fromRight: 0,
      setupPlayer: (player) => {
        const video = player.video

        const getCall = () => rtmpCallsController.currentCall

        player.updateLiveViewersCount(getCall().call.participants_count)
        if(!IS_SAFARI || params.isAdmin) {
          player.setupLiveMenu([
            {
              icon: 'volume_up',
              text: 'Rtmp.MediaViewer.Menu.OutputDevice',
              onClick: () => PopupElement.createPopup(OutputDevicePopup, player.video).show(),
              verify: () => typeof navigator.mediaDevices?.enumerateDevices === 'function' && !IS_SAFARI
            },
            {
              icon: 'radioon',
              text: 'Rtmp.MediaViewer.Menu.StartRecording',
              verify: () => getCall()?.admin && !getCall().call.pFlags.record_video_active,
              onClick: () => PopupElement.createPopup(RtmpRecordPopup).show()
            },
            {
              icon: 'radiooff',
              text: 'Rtmp.MediaViewer.Menu.StopRecording',
              verify: () => getCall()?.admin && getCall().call.pFlags.record_video_active,
              onClick: () => {
                this.managers.appGroupCallsManager.stopRecording(getCall().inputCall).catch(() => {
                  toastNew({
                    langPackKey: 'Error.AnError'
                  })
                })
              }
            },
            {
              icon: 'settings',
              text: 'Rtmp.MediaViewer.Menu.StreamSettings',
              verify: () => getCall()?.admin,
              onClick: () => {
                PopupElement.createPopup(RtmpStartStreamPopup, {
                  peerId: this._peerId,
                  active: true,
                  onEndStream: () => this.close(undefined, true)
                }).show()
              }
            },
            {
              icon: 'crossround',
              text: 'Rtmp.MediaViewer.Menu.EndLiveStream',
              danger: true,
              verify: () => getCall()?.admin,
              onClick: () => this.close(undefined, true)
            }
          ])
        }

        const onEnded = () => {
          this.retryLoadStream(video);
        };

        const onError = () => {
          if(!video.error) return;
          this.retryLoadStream(video);
        }

        const onPause = () => {
          if(!video.error && !video.ended) {
            video.play()
          }
        };

        this._listenerSetter.add(video)('pause', onPause);
        this._listenerSetter.add(video)('error', onError);
        this._listenerSetter.add(video)('ended', onEnded);
      }
    })

    this._listenerSetter.add(rtmpCallsController)('currentCallChanged', (call) => {
      if(!call) {
        this.close(undefined, true)
        return
      }

      this.videoPlayer?.updateLiveViewersCount(call.call.participants_count)
    })
  }

  protected toggleAdminPanel(visible: boolean) {
    SetTransition({
      element: this.adminPanel,
      className: 'admin-hidden',
      forwards: !visible,
      duration: 300
    });
  }

  protected showLoader() {
    const mover = this.content.mover;
    const thumbnail = mover.querySelector('canvas.canvas-thumbnail, .thumbnail-avatar') as HTMLElement;
    let preloaderTemplate = mover.querySelector('.preloader-template') as HTMLDivElement;
    if(!preloaderTemplate) {
      preloaderTemplate = document.createElement('div');
      preloaderTemplate.classList.add('preloader-template');
    }

    const liveEl = mover.querySelector('.controls-live') as HTMLElement;
    liveEl.classList.remove('is-not-buffering');
    this.videoPlayer.video.parentElement.classList.add('is-buffering');

    thumbnail.insertAdjacentElement('afterend', preloaderTemplate);
    this.preloaderRtmp.attach(preloaderTemplate, true);
  }

  protected retryLoadStream(video: HTMLVideoElement) {
    const myCallId = rtmpCallsController.currentCall?.call.id
    if(!myCallId) {
      this.close(undefined, true)
      return;
    }

    let isFirst = true
    let checkJoined = true
    let errors = 0

    const retry = () => {
      clearTimeout(this._retryTimeout);
      rtmpCallsController.isCurrentCallDead(checkJoined).then((empty) => {
        if(rtmpCallsController.currentCall?.call.id !== myCallId) {
          // destroyed
          return;
        }

        console.log('empty', empty, isFirst, checkJoined)
        checkJoined = empty === 'dying'

        if(empty === 'dead' || empty === 'dying') {
          if(isFirst) {
            this.showLoader()
            if(rtmpCallsController.currentCall?.admin) {
              this.toggleAdminPanel(true)
            }
            if(IS_SAFARI) {
              // если не сделать этого то сафари продолжит пытаться достучаться
              apiManagerProxy.serviceMessagePort.invokeVoid('leaveRtmpCall', [rtmpCallsController.currentCall.call.id, false]);
            }
          }
          isFirst = false;
          this._retryTimeout = setTimeout(retry, 1000);
          return;
        }

        if(rtmpCallsController.currentCall?.admin) {
          this.toggleAdminPanel(false)
        }

        video.src = getRtmpStreamUrl(rtmpCallsController.currentCall.inputCall);
        video.load();
        video.play();
      }).catch((err) => {
        if(rtmpCallsController.currentCall?.call.id !== myCallId) {
          // destroyed
          return;
        }

        if(++errors > 5) {
          toastNew({
            langPackKey: 'Error.AnError'
          })
          this.close(undefined, true)
        } else {
          this._retryTimeout = setTimeout(retry, 1000);
        }
      })
    }

    retry();
  }

  private async leaveCall(discard = false) {
    rtmpCallsController.leaveCall(discard).catch(() => {
      toastNew({
        langPackKey: 'Error.AnError'
      })
    })
  }

  static closeActivePip(end = false) {
    if(!AppMediaViewerRtmp.activeInstance) return

    if(AppMediaViewerRtmp.activeInstance.videoPlayer?.inPip) {
      document.exitPictureInPicture()
    }
  }

  async close(e?: MouseEvent, end = false) {
    const hadPip = this.videoPlayer?.inPip
    if(this.videoPlayer) {
      try {
        const capturedBlob = await videoToImage(this.videoPlayer.video)
        if(AppMediaViewerRtmp.previousCapture) {
          URL.revokeObjectURL(AppMediaViewerRtmp.previousCapture)
        }
        AppMediaViewerRtmp.previousCapture = URL.createObjectURL(capturedBlob)
        AppMediaViewerRtmp.previousPeerId = this._peerId
      } catch(e) {}
    }
    clearTimeout(this._retryTimeout);

    super.close(e)
    AppMediaViewerRtmp.activeInstance = null

    if(rtmpCallsController.currentCall) {
      this.leaveCall(end)
    }

    this._listenerSetter.removeAll()
    if(hadPip) {
      document.exitPictureInPicture()
    }
  }
}
