import {Show, createEffect, createSignal, on} from 'solid-js'
import {TopbarLive} from './topbarLive'
import {useChat, useCurrentPeerId} from '../../../helpers/solid/useCurrentChat'
import {subscribeOn} from '../../../helpers/solid/subscribeOn'
import rootScope from '../../../lib/rootScope'
import {rtmpCallsController} from '../../../lib/calls/rtmpCallsController'
import {useCurrentRtmpCall} from '../../groupCall/rtmp/hooks'
import {AppMediaViewerRtmp} from '../../appMediaViewerRtmp'
import {toastNew} from '../../toast'

export const TopbarLiveContainer = () => {
  const peerId  = useCurrentPeerId()

  const chat = useChat(peerId)
  const getFullChat = () => rootScope.managers.appProfileManager.getChatFull(peerId().toChatId())
  const currentCall = useCurrentRtmpCall()

  const isGroupCallActive = () => {
    if(!peerId().isAnyChat()) return false
    const _chat = chat()

    return _chat?._ === 'channel' && _chat.pFlags.call_active && _chat.pFlags.call_not_empty
  }

  const [watching, setWatching] = createSignal<number | undefined>(undefined)

  subscribeOn(rootScope)('group_call_update', async(call) => {
    if(!isGroupCallActive() || call._ !== 'groupCall') return
    const fullChat = await getFullChat()
    if(fullChat?._ !== 'channelFull') return

    if(call.id !== fullChat.call?.id) return

    setWatching(call.participants_count)
  })

  createEffect(on(isGroupCallActive, async(active) => {
    if(!active) {
      setWatching(undefined)
      return
    }

    const fullChat = await getFullChat()
    if(fullChat?._ !== 'channelFull' || !fullChat.call) return

    const call = await rootScope.managers.appGroupCallsManager.getGroupCallFull(fullChat.call.id)
    if(call?._ !== 'groupCall') return

    setWatching(call.participants_count)
  }))

  const openPlayer = () => {
    if(AppMediaViewerRtmp.activeInstance) return

    new AppMediaViewerRtmp().openMedia({
      peerId: peerId(),
      isAdmin: currentCall.call().admin
    })
  }
  const onJoinClicked = async() => {
    if(rtmpCallsController.currentCall) return

    await rtmpCallsController.joinCall(peerId().toChatId()).catch((err) => {
      console.error(err)
      toastNew({
        langPackKey: 'Error.AnError'
      })
    })
  }
  subscribeOn(rtmpCallsController)('currentCallChanged', (call) => {
    if(call && call.peerId === peerId()) {
      openPlayer()
    }
  })
  subscribeOn(rtmpCallsController)('pipToggled', (enabled) => {
    if(!enabled) {
      openPlayer()
    }
  })

  return (
    <>
      <Show when={isGroupCallActive() && currentCall.call() === null}>
        <TopbarLive
          watching={watching()}
          animationTrigger={peerId()}
          onJoin={onJoinClicked}
        />
      </Show>
    </>
  )
}

