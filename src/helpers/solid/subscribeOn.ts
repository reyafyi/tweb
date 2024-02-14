import {onCleanup} from 'solid-js';
import {RootScope} from '../../lib/rootScope';
import {ListenerElement} from '../listenerSetter';

export function subscribeOn<T extends ListenerElement>(obj: T): T['addEventListener'] {
  return ((event: string, callback: Function) => {
    // @ts-ignore
    obj.addEventListener(event, callback)

    onCleanup(() => {
      // @ts-ignore
      obj.removeEventListener(event, callback)
    })
  }) as any;
}
