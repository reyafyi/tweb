import {Ripple} from '../../rippleTsx'
import numberThousandSplitter from '../../../helpers/number/numberThousandSplitter'
import {cnTopbarLive} from './topbarLive.cn'
import {TopbarLiveButton} from './button'

import {Skeleton} from '../../skeleton'

import './topbarLive.scss'
import {i18n} from '../../../lib/langPack'

export interface TopbarLiveProps {
  watching?: number
  onJoin: () => void
  animationTrigger: unknown
}

export const TopbarLive = (props: TopbarLiveProps) => {
  const watching = () => props.watching > 0 ?
    i18n('Rtmp.Topbar.Watching', [numberThousandSplitter(Math.max(0, props.watching), ',')]) :
    i18n('Rtmp.Topbar.NoViewers');

  return (
    <Ripple>
      <div class={cnTopbarLive()} on:click={props.onJoin}>
        <div class={cnTopbarLive('-line')} />
        <div class={cnTopbarLive('-content')}>
          <div class={cnTopbarLive('-content-title')}>{i18n('Rtmp.Topbar.Title')}</div>
          <div class={cnTopbarLive('-content-subtitle')}>
            <Skeleton loading={props.watching === undefined}>
              {watching()}
            </Skeleton>
          </div>
        </div>

        <TopbarLiveButton animationTrigger={props.animationTrigger} />
      </div>
    </Ripple>
  );
}
