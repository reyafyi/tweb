import {createEffect, createSignal, on, onCleanup, onMount} from 'solid-js';
import Chat from '../../components/chat/chat';
import appImManager from '../../lib/appManagers/appImManager';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import rootScope from '../../lib/rootScope';
import {s} from 'vitest/dist/reporters-5f784f42';

export function useCurrentPeerId() {
  const [peerId, setPeerId] = createSignal<number>(appImManager.chat.peerId)

  const onChange = (chat: Chat) => {
    setPeerId(chat.peerId)
  }

  onMount(() => {
    appImManager.addEventListener('peer_changed', onChange)
  })

  onCleanup(() => {
    appImManager.removeEventListener('peer_changed', onChange)
  })

  return peerId
}

export function useChat(peerId: () => PeerId) {
  const [chat, setChat] = createSignal(apiManagerProxy.getChat(peerId()))

  const onUpdate = (chatId: ChatId) => {
    const _peerId = peerId()
    if(_peerId === chatId.toPeerId(true)) {
      setChat(apiManagerProxy.getChat(_peerId))
    }
  }

  createEffect(on(peerId, (id) => {
    setChat(apiManagerProxy.getChat(id))
  }))

  onMount(() => {
    rootScope.addEventListener('chat_update', onUpdate)
  })

  onCleanup(() => {
    rootScope.removeEventListener('chat_update', onUpdate)
  })

  return chat
}
