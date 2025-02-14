/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {GroupCall} from '../../layer';
import GroupCallInstance from '../../lib/calls/groupCallInstance';
import GROUP_CALL_STATE from '../../lib/calls/groupCallState';
import {RtmpCallInfo} from '../../lib/calls/rtmpCallsController';
import I18n, {LangPackKey, FormatterArguments} from '../../lib/langPack';

export default class GroupCallDescriptionElement {
  private descriptionIntl: I18n.IntlElement;

  constructor(private appendTo: HTMLElement) {
    this.descriptionIntl = new I18n.IntlElement({
      key: 'VoiceChat.Status.Connecting'
    });

    this.descriptionIntl.element.classList.add('group-call-description');
  }

  public detach() {
    this.descriptionIntl.element.remove();
  }

  public update(state: GROUP_CALL_STATE, instance: GroupCallInstance | RtmpCallInfo) {
    let key: LangPackKey, args: FormatterArguments;
    if(state === GROUP_CALL_STATE.CONNECTING) {
      key = 'VoiceChat.Status.Connecting';
    } else {
      key = 'VoiceChat.Status.Members';
      args = '_type' in instance ?
        [Math.max(0, instance.call.participants_count)] :
        [(instance.groupCall as GroupCall.groupCall).participants_count];
    }

    const {descriptionIntl} = this;
    descriptionIntl.compareAndUpdate({
      key,
      args
    });

    if(!this.descriptionIntl.element.parentElement) {
      this.appendTo.append(this.descriptionIntl.element);
    }
  }
}
