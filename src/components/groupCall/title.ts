/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {GroupCall} from '../../layer';
import GroupCallInstance from '../../lib/calls/groupCallInstance';
import {RtmpCallInfo} from '../../lib/calls/rtmpCallsController';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import PeerTitle from '../peerTitle';

export default class GroupCallTitleElement {
  private peerTitle: PeerTitle;

  constructor(private appendTo: HTMLElement) {
    this.peerTitle = new PeerTitle({peerId: 0});
  }

  public update(instance: GroupCallInstance | RtmpCallInfo) {
    if('_type' in instance) {
      const peerId = instance.peerId;
      this.peerTitle.options.peerId = peerId;
      this.peerTitle.update();

      if(this.peerTitle.element.parentElement !== this.appendTo) {
        this.appendTo.append(this.peerTitle.element);
      }
      return
    }

    const {peerTitle, appendTo} = this;
    const groupCall = instance.groupCall as GroupCall.groupCall;
    const peerId = instance.chatId.toPeerId(true);
    if(groupCall.title) {
      setInnerHTML(appendTo, wrapEmojiText(groupCall.title));
    } else {
      if(peerTitle.options.peerId !== peerId) {
        peerTitle.options.peerId = peerId;
        peerTitle.update();
      }

      if(peerTitle.element.parentElement !== appendTo) {
        appendTo.append(peerTitle.element);
      }
    }
  }
}
