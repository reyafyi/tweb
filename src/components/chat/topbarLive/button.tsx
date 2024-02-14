import {Show, createEffect, createSignal, on, onMount} from 'solid-js'
import {cnTopbarLive} from './topbarLive.cn'

interface TopbarLiveButtonProps {
    animationTrigger: unknown
}

export const TopbarLiveButton = (props: TopbarLiveButtonProps) => {
  const [animating, setAnimating] = createSignal(true)

  createEffect(
    on(() => props.animationTrigger, () => {
      setAnimating(true)
    })
  )

  return (
    <button class={cnTopbarLive('-button-wrap')}>
      <Show when={animating()}>
        <div
          class={cnTopbarLive('-button-animation')}
          onAnimationEnd={() => setAnimating(false)}
        />
      </Show>

      <div class={cnTopbarLive('-button')}>JOIN</div>
    </button>
  )
}
