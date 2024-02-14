import {Show, render} from 'solid-js/web';
import PopupElement from '../../popups';
import {RadioFormFromValues} from '../../row';

import './outputDevicePopup.css'
import {Transition} from 'solid-transition-group';
import {i18n} from '../../../lib/langPack';

export class OutputDevicePopup extends PopupElement {
  protected _dispose: () => void

  cleanup() {
    this._dispose();
  }

  constructor(readonly video: HTMLVideoElement) {
    super('rtmp-output-popup', {
      overlayClosable: true,
      title: true,
      body: true,
      buttons: [
        {
          langKey: 'OK',
          callback: () => {
            // @ts-ignore
            video.setSinkId(chosenDeviceId)
          }
        }
      ]
    })

    // @ts-ignore
    const currentSinkId = video.sinkId || 'default'
    let chosenDeviceId = currentSinkId

    this.title.append(i18n('Rtmp.OutputPopup.Title'))
    if(!document.documentElement.classList.contains('night')) {
      this.element.classList.remove('night')
    }

    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const outputs = devices.filter((device) => device.kind === 'audiooutput');
      const form = RadioFormFromValues(
        outputs.map((device) => ({
          text: device.label,
          value: device.deviceId,
          // @ts-ignore
          checked: device.deviceId === currentSinkId
        })),
        (id) => {
          chosenDeviceId = id
        }
      )

      this._dispose = render(() => <>
        <Transition name="fade" mode="outin">
          <Show when={outputs.length === 0} fallback={form}>
            {
              RadioFormFromValues(
                [{
                  text: i18n('Rtmp.OutputPopup.Default').innerText,
                  value: '',
                  // @ts-ignore
                  checked: true
                }],
                (id) => {}
              )
            }
          </Show>
        </Transition>
      </>, this.body);
    })
  }
}
