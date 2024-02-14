import {createSignal} from 'solid-js'
import {RtmpCallInfo, rtmpCallsController} from '../../../lib/calls/rtmpCallsController'
import {subscribeOn} from '../../../helpers/solid/subscribeOn'

export function useCurrentRtmpCall() {
  const [call, setCall] = createSignal<RtmpCallInfo | null>(rtmpCallsController.currentCall)
  const [peerId, setPeerId] = createSignal<PeerId | null>(null)

  subscribeOn(rtmpCallsController)('currentCallChanged', (call: RtmpCallInfo) => {
    setCall(call ? {...call} : null)
    setPeerId(call?.peerId)
  })

  subscribeOn(rtmpCallsController)('startedJoining', (peer?: PeerId) => {
    setPeerId(peer)
  })

  return {call, peerId}
}
