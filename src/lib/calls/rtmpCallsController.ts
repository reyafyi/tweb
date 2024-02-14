import {MOUNT_CLASS_TO} from '../../config/debug';
import EventListenerBase from '../../helpers/eventListenerBase';
import {nextRandomUint} from '../../helpers/random';
import {DataJSON, GroupCall, InputGroupCall} from '../../layer';
import {JoinGroupCallJsonPayload} from '../appManagers/appGroupCallsManager';
import {AppManagers} from '../appManagers/managers';
import apiManagerProxy from '../mtproto/mtprotoworker';
import rootScope from '../rootScope';
import {RTMP_UNIFIED_CHANNEL_ID, RTMP_UNIFIED_QUALITY} from './constants';

export interface RtmpCallInfo {
  _type: 'rtmp'
  chatId: ChatId;
  peerId: PeerId;
  call: GroupCall.groupCall;
  inputCall: InputGroupCall;
  ssrc: number;
  pip: boolean;
  admin: boolean;
  lastKnownTime: string;
}

export class RtmpCallsController extends EventListenerBase<{
  startedJoining: (peerId: PeerId) => void;
  currentCallChanged: (call: RtmpCallInfo | null) => void;
  pipToggled: (enabled: boolean) => void;
}> {
  private managers: AppManagers;

  public currentCall: RtmpCallInfo | null = null;

  public construct(managers: AppManagers) {
    this.managers = managers;

    rootScope.addEventListener('group_call_update', this._onGroupCallUpdate.bind(this));
  }

  _onGroupCallUpdate(update: GroupCall) {
    if(update.id !== this.currentCall?.call.id) return;

    if(update._ === 'groupCallDiscarded') {
      this.currentCall = null;
      this.dispatchEvent('currentCallChanged', null);
      return
    }

    this.currentCall.call = update;
    this.dispatchEvent('currentCallChanged', this.currentCall);
  }

  private _randomSsrc() {
    // random signed int32
    return (Math.random() < 0.5 ? -1 : 1) * nextRandomUint(16)
  }
  private _getJoinPayload(ssrc: number): DataJSON {
    const innerData: JoinGroupCallJsonPayload = {
      'fingerprints':[],
      'pwd':'',
      'ssrc': ssrc,
      'ssrc-groups':[],
      'ufrag':''
    }

    return {
      _: 'dataJSON',
      data: JSON.stringify(innerData)
    }
  }

  public async joinCall(chatId: ChatId) {
    if(this.currentCall) {
      throw new Error('Already in rtmp call');
    }

    this.dispatchEvent('startedJoining', chatId.toPeerId());

    const ssrc = this._randomSsrc();
    const data = this._getJoinPayload(ssrc);

    const chat = await this.managers.appProfileManager.getChatFull(chatId);
    if(chat._ !== 'channelFull') {
      throw new Error('Not a chat');
    }

    const call = await this.managers.appGroupCallsManager.getGroupCallFull(chat.call.id);
    if(call._ !== 'groupCall') {
      throw new Error('Not a group call');
    }

    const update = await this.managers.appGroupCallsManager.joinGroupCall(chat.call.id, data, {type: 'main'});
    const updateData = JSON.parse(update.params.data)
    if(updateData.rtmp !== true) {
      throw new Error('Not an rtmp call');
    }

    this.currentCall = {
      _type: 'rtmp',
      call,
      inputCall: {
        _: 'inputGroupCall',
        id: call.id,
        access_hash: call.access_hash
      },
      chatId,
      peerId: chatId.toPeerId(true),
      ssrc,
      pip: false,
      admin: Boolean(chat.pFlags?.can_delete_channel),
      lastKnownTime: '0'
    }
    this.dispatchEvent('currentCallChanged', this.currentCall);
  }

  public async leaveCall(discard = false) {
    if(!this.currentCall) return;
    const currentCall = this.currentCall;

    this.currentCall = null;
    this.dispatchEvent('currentCallChanged', null);
    apiManagerProxy.serviceMessagePort.invokeVoid('leaveRtmpCall', [currentCall.call.id, true]);
    await this.managers.appGroupCallsManager.hangUp(currentCall.call.id, discard ? true : currentCall.ssrc);
  }

  public async isCurrentCallDead(checkJoined = false, triedRejoin = false): Promise<'dead' | 'dying' | 'alive'> {
    if(!this.currentCall) return 'dead';

    const state = await this.managers.appGroupCallsManager.fetchRtmpState(this.currentCall.inputCall);
    if(!checkJoined) return state.channels.length === 0 ? 'dead' : 'alive';

    // check if we are joined by trying to fetch a part
    const unified = state.channels.find(it => it.channel === RTMP_UNIFIED_CHANNEL_ID)
    if(!unified) return 'dead';
    try {
      const time = this.currentCall.lastKnownTime === '0' ? unified.last_timestamp_ms : this.currentCall.lastKnownTime;
      await this.managers.appGroupCallsManager.fetchRtmpPart({
        _: 'inputGroupCallStream',
        call: this.currentCall.inputCall,
        video_channel: RTMP_UNIFIED_CHANNEL_ID,
        video_quality: RTMP_UNIFIED_QUALITY,
        scale: unified.scale,
        time_ms: time
      }, state.dcId);
      return 'alive';
    } catch(e: any) {
      if(e.type === 'GROUPCALL_JOIN_MISSING' && !triedRejoin) {
        try {
          await this.rejoinCall();
          return this.isCurrentCallDead(true, true);
        } catch(e) {}
      }
    }

    return 'dying'
  }

  public async rejoinCall() {
    if(!this.currentCall) return;
    this.currentCall.ssrc = this._randomSsrc();
    const data = this._getJoinPayload(this.currentCall.ssrc)
    await this.managers.appGroupCallsManager.joinGroupCall(this.currentCall.call.id, data, {type: 'main'});
  }
}


export const rtmpCallsController = new RtmpCallsController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.rtmpCallsController = rtmpCallsController);
