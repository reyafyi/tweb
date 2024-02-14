/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMediaPlaybackController from '../components/appMediaPlaybackController';
import {IS_APPLE_MOBILE, IS_MOBILE} from '../environment/userAgent';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import cancelEvent from '../helpers/dom/cancelEvent';
import ListenerSetter, {Listener} from '../helpers/listenerSetter';
import {ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from '../components/buttonMenu';
import ButtonMenuToggle, {ButtonMenuToggleHandler} from '../components/buttonMenuToggle';
import ControlsHover from '../helpers/dom/controlsHover';
import {addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen} from '../helpers/dom/fullScreen';
import toHHMMSS from '../helpers/string/toHHMMSS';
import MediaProgressLine from '../components/mediaProgressLine';
import VolumeSelector from '../components/volumeSelector';
import debounce from '../helpers/schedulers/debounce';
import overlayCounter from '../helpers/overlayCounter';
import onMediaLoad from '../helpers/onMediaLoad';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import safePlay from '../helpers/dom/safePlay';
import ButtonIcon from '../components/buttonIcon';
import Button from '../components/button';
import Icon from '../components/icon';
import setCurrentTime from '../helpers/dom/setCurrentTime';
import {i18n} from './langPack';

export default class VideoPlayer extends ControlsHover {
  private static PLAYBACK_RATES = [0.5, 1, 1.5, 2];
  private static PLAYBACK_RATES_ICONS: Icon[] = ['playback_05', 'playback_1x', 'playback_15', 'playback_2x'];

  video: HTMLVideoElement;
  protected wrapper: HTMLDivElement;
  protected progress: MediaProgressLine;
  protected skin: 'default';
  protected live: boolean;

  protected listenerSetter: ListenerSetter;
  protected playbackRateButton: HTMLElement;
  protected pipButton: HTMLElement;
  protected liveMenuButton: HTMLElement;
  protected toggles: HTMLElement[];
  liveEl: HTMLElement;

  /* protected videoParent: HTMLElement;
  protected videoWhichChild: number; */

  protected onPlaybackRackMenuToggle?: (open: boolean) => void;
  protected onPip?: (pip: boolean) => void;
  protected onPipClose?: () => void;

  constructor({
    video,
    play = false,
    streamable = false,
    duration,
    live = false,
    onPlaybackRackMenuToggle,
    onPip,
    onPipClose
  }: {
    video: HTMLVideoElement,
    play?: boolean,
    streamable?: boolean,
    duration?: number,
    live?: boolean,
    onPlaybackRackMenuToggle?: VideoPlayer['onPlaybackRackMenuToggle'],
    onPip?: VideoPlayer['onPip'],
    onPipClose?: VideoPlayer['onPipClose']
  }) {
    super();

    this.video = video;
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('ckin__player');
    this.live = live;

    this.onPlaybackRackMenuToggle = onPlaybackRackMenuToggle;
    this.onPip = onPip;
    this.onPipClose = onPipClose;

    this.listenerSetter = new ListenerSetter();

    this.setup({
      element: this.wrapper,
      listenerSetter: this.listenerSetter,
      canHideControls: () => {
        return !this.video.paused && !live && (!this.playbackRateButton || !this.playbackRateButton.classList.contains('menu-open'));
      },
      showOnLeaveToClassName: 'media-viewer-caption',
      ignoreClickClassName: 'ckin__controls'
    });

    video.parentNode.insertBefore(this.wrapper, video);
    this.wrapper.appendChild(video);

    this.skin = 'default';

    this.stylePlayer(duration);
    this.setBtnMenuToggle();

    if(this.skin === 'default') {
      const controls = this.wrapper.querySelector('.default__controls.ckin__controls') as HTMLDivElement;
      if(!live) {
        this.progress = new MediaProgressLine({
          onSeekStart: () => {
            this.wrapper.classList.add('is-seeking');
          },
          onSeekEnd: () => {
            this.wrapper.classList.remove('is-seeking');
          }
        });
        this.progress.setMedia({
          media: video,
          streamable,
          duration
        });
        controls.prepend(this.progress.container);
      }
    }

    if(play/*  && video.paused */) {
      const promise = video.play();
      promise.catch((err: Error) => {
        if(err.name === 'NotAllowedError') {
          video.muted = true;
          video.autoplay = true;
          safePlay(video);
        }
      }).finally(() => { // due to autoplay, play will not call
        this.setIsPlaing(!this.video.paused);
      });
    }

    if(live) {
      this.lockControls(true)
    }
  }

  private setIsPlaing(isPlaying: boolean) {
    this.wrapper.classList.toggle('is-playing', isPlaying);
    this.toggles.forEach((toggle) => {
      toggle.replaceChildren(Icon(isPlaying ? 'pause' : 'play'));
    });
  }

  private stylePlayer(initDuration: number) {
    const {wrapper, video, skin, listenerSetter, live} = this;

    wrapper.classList.add(skin);
    if(live) wrapper.classList.add(`${skin}-live`);

    const html = this.buildControls();
    wrapper.insertAdjacentHTML('beforeend', html);
    let timeDuration: HTMLElement;

    if(skin === 'default') {
      const mainToggle = Button(`${skin}__button--big toggle`, {noRipple: true, icon: 'play'});
      wrapper.firstElementChild.after(mainToggle);

      const leftControls = wrapper.querySelector('.left-controls') as HTMLElement;
      if(live) {
        this.toggles = []
      } else {
        const leftToggle = ButtonIcon(` ${skin}__button toggle`, {noRipple: true});
        leftControls.prepend(leftToggle);
        this.toggles = [leftToggle];
      }

      const rightControls = wrapper.querySelector('.right-controls') as HTMLElement;
      if(!live) {
        this.playbackRateButton = ButtonIcon(` ${skin}__button btn-menu-toggle night`, {noRipple: true});
      }
      if(!IS_MOBILE && document.pictureInPictureEnabled) {
        this.pipButton = ButtonIcon(`pip ${skin}__button`, {noRipple: true});
      }
      const fullScreenButton = ButtonIcon(` ${skin}__button`, {noRipple: true});
      rightControls.append(...[this.playbackRateButton, this.pipButton, fullScreenButton].filter(Boolean));

      const toggles = this.toggles;
      const timeElapsed = wrapper.querySelector('#time-elapsed');
      timeDuration = wrapper.querySelector('#time-duration') as HTMLElement;
      if(timeDuration) timeDuration.textContent = toHHMMSS(video.duration | 0);

      const volumeSelector = new VolumeSelector(listenerSetter);

      volumeSelector.btn.classList.remove('btn-icon');
      leftControls.insertBefore(volumeSelector.btn, timeElapsed.parentElement);

      toggles.forEach((button) => {
        attachClickEvent(button, () => {
          this.togglePlay();
        }, {listenerSetter: this.listenerSetter});
      });

      if(this.pipButton) {
        attachClickEvent(this.pipButton, () => {
          this.video.requestPictureInPicture()
        }, {listenerSetter: this.listenerSetter});

        const onPip = (pip: boolean) => {
          this.wrapper.style.visibility = pip ? 'hidden': '';
          if(this.onPip) {
            this.onPip(pip);
          }
        };

        const debounceTime = 20;
        const debouncedPip = debounce(onPip, debounceTime, false, true);

        listenerSetter.add(video)('enterpictureinpicture', () => {
          this._inPip = true;
          debouncedPip(true);

          listenerSetter.add(video)('leavepictureinpicture', () => {
            this._inPip = false;

            const onPause = () => {
              clearTimeout(timeout);
              if(this.onPipClose) {
                this.onPipClose();
              }
            };
            const listener = listenerSetter.add(video)('pause', onPause, {once: true}) as any as Listener;
            const timeout = setTimeout(() => {
              listenerSetter.remove(listener);
            }, debounceTime);
          }, {once: true});
        });

        listenerSetter.add(video)('leavepictureinpicture', () => {
          debouncedPip(false);
          this._inPip = false;
        });
      }

      if(!IS_TOUCH_SUPPORTED) {
        if(!live) {
          attachClickEvent(video, () => {
            this.togglePlay();
          }, {listenerSetter: this.listenerSetter});
        }

        listenerSetter.add(document)('keydown', (e: KeyboardEvent) => {
          if(overlayCounter.overlaysActive > 1 || document.pictureInPictureElement === video) { // forward popup is active, etc
            return;
          }

          const {key, code} = e;

          let good = true;
          if(code === 'KeyF') {
            this.toggleFullScreen();
          } else if(code === 'KeyM') {
            appMediaPlaybackController.muted = !appMediaPlaybackController.muted;
          } else if(code === 'Space' && !live) {
            this.togglePlay();
          } else if(e.altKey && (code === 'Equal' || code === 'Minus') && !live) {
            const add = code === 'Equal' ? 1 : -1;
            const playbackRate = appMediaPlaybackController.playbackRate;
            const idx = VideoPlayer.PLAYBACK_RATES.indexOf(playbackRate);
            const nextIdx = idx + add;
            if(nextIdx >= 0 && nextIdx < VideoPlayer.PLAYBACK_RATES.length) {
              appMediaPlaybackController.playbackRate = VideoPlayer.PLAYBACK_RATES[nextIdx];
            }
          } else if(wrapper.classList.contains('ckin__fullscreen') && (key === 'ArrowLeft' || key === 'ArrowRight') && !live) {
            if(key === 'ArrowLeft') appMediaPlaybackController.seekBackward({action: 'seekbackward'});
            else appMediaPlaybackController.seekForward({action: 'seekforward'});
          } else {
            good = false;
          }

          if(good) {
            cancelEvent(e);
            return false;
          }
        });
      }

      listenerSetter.add(video)('dblclick', () => {
        if(!IS_TOUCH_SUPPORTED) {
          this.toggleFullScreen();
        }
      });

      attachClickEvent(fullScreenButton, () => {
        this.toggleFullScreen();
      }, {listenerSetter: this.listenerSetter});

      addFullScreenListener(wrapper, this.onFullScreen.bind(this, fullScreenButton), listenerSetter);
      this.onFullScreen(fullScreenButton);

      if(live) {

      } else {
        listenerSetter.add(video)('timeupdate', () => {
          timeElapsed.textContent = toHHMMSS(video.currentTime | 0);
        });
      }

      listenerSetter.add(video)('play', () => {
        wrapper.classList.add('played');

        if(!IS_TOUCH_SUPPORTED) {
          listenerSetter.add(video)('play', () => {
            if(!live) {
              this.hideControls(true);
            }
          });
        }
      }, {once: true});

      listenerSetter.add(video)('pause', () => {
        this.showControls(false);
      });

      listenerSetter.add(appMediaPlaybackController)('playbackParams', () => {
        this.setPlaybackRateIcon();
      });

      if(live) {
        this.liveEl = i18n('Rtmp.MediaViewer.Live')
        this.liveEl.classList.add('controls-live');
        leftControls.prepend(this.liveEl);
      }
    }

    listenerSetter.add(video)('play', () => {
      this.setIsPlaing(true);
    });

    if(!live) {
      listenerSetter.add(video)('pause', () => {
        this.setIsPlaing(false);
      });
    }

    if(timeDuration) {
      if(video.duration || initDuration) {
        timeDuration.textContent = toHHMMSS(Math.round(video.duration || initDuration));
      } else {
        onMediaLoad(video).then(() => {
          timeDuration.textContent = toHHMMSS(Math.round(video.duration));
        });
      }
    }
  }

  protected togglePlay(isPaused = this.video.paused) {
    this.video[isPaused ? 'play' : 'pause']();
  }

  private buildControls() {
    const skin = this.skin;

    if(skin === 'default') {
      const time = this.live ? `
      <span id="time-elapsed"></span>
      ` : `
      <time id="time-elapsed">0:00</time>
      <span> / </span>
      <time id="time-duration">0:00</time>
      `


      return `
      ${!this.live ? `<div class="${skin}__gradient-bottom ckin__controls"></div>` : ''}
      <div class="${skin}__controls ckin__controls">
        <div class="bottom-controls">
          <div class="left-controls">
            <div class="time">
              ${time}
            </div>
          </div>
          <div class="right-controls"></div>
        </div>
      </div>`;
    }
  }

  protected setBtnMenuToggle() {
    if(!this.playbackRateButton) return
    const buttons = VideoPlayer.PLAYBACK_RATES.map((rate, idx) => {
      const buttonOptions: Parameters<typeof ButtonMenuSync>[0]['buttons'][0] = {
        // icon: VideoPlayer.PLAYBACK_RATES_ICONS[idx],
        regularText: rate + 'x',
        onClick: () => {
          appMediaPlaybackController.playbackRate = rate;
        }
      };

      return buttonOptions;
    });
    const btnMenu = ButtonMenuSync({buttons});
    btnMenu.classList.add('top-left');
    ButtonMenuToggleHandler({
      el: this.playbackRateButton,
      onOpen: this.onPlaybackRackMenuToggle ? () => {
        this.onPlaybackRackMenuToggle(true);
      } : undefined,
      onClose: this.onPlaybackRackMenuToggle ? () => {
        this.onPlaybackRackMenuToggle(false);
      } : undefined
    });
    this.setPlaybackRateIcon();
    this.playbackRateButton.append(btnMenu);
  }

  protected setPlaybackRateIcon() {
    if(!this.playbackRateButton) return
    const playbackRateButton = this.playbackRateButton;

    let idx = VideoPlayer.PLAYBACK_RATES.indexOf(appMediaPlaybackController.playbackRate);
    if(idx === -1) idx = VideoPlayer.PLAYBACK_RATES.indexOf(1);

    const icon = Icon(VideoPlayer.PLAYBACK_RATES_ICONS[idx]);
    if(playbackRateButton.firstElementChild) {
      playbackRateButton.firstElementChild.replaceWith(icon);
    } else {
      playbackRateButton.append(icon);
    }
  }

  protected toggleFullScreen() {
    const player = this.wrapper;

    // * https://caniuse.com/#feat=fullscreen
    if(IS_APPLE_MOBILE) {
      const video = this.video as any;
      video.webkitEnterFullscreen();
      video.enterFullscreen();
      return;
    }

    if(!isFullScreen()) {
      /* const videoParent = this.video.parentElement;
      const videoWhichChild = whichChild(this.video);
      const needVideoRemount = videoParent !== player;

      if(needVideoRemount) {
        this.videoParent = videoParent;
        this.videoWhichChild = videoWhichChild;
        player.prepend(this.video);
      } */

      requestFullScreen(player);
    } else {
      /* if(this.videoParent) {
        const {videoWhichChild, videoParent} = this;
        if(!videoWhichChild) {
          videoParent.prepend(this.video);
        } else {
          videoParent.insertBefore(this.video, videoParent.children[videoWhichChild]);
        }

        this.videoParent = null;
        this.videoWhichChild = -1;
      } */

      cancelFullScreen();
    }
  }

  protected onFullScreen(fullScreenButton: HTMLElement) {
    const isFull = isFullScreen();
    this.wrapper.classList.toggle('ckin__fullscreen', isFull);
    if(!isFull) {
      fullScreenButton.replaceChildren(Icon('fullscreen'));
      fullScreenButton.setAttribute('title', 'Full Screen');
    } else {
      fullScreenButton.replaceChildren(Icon('smallscreen'));
      fullScreenButton.setAttribute('title', 'Exit Full Screen');
    }
  }

  public dimBackground() {
    this.wrapper.classList.add('dim-background');
  }

  public setTimestamp(timestamp: number) {
    setCurrentTime(this.video, timestamp);
    this.togglePlay(true);
  }

  public cleanup() {
    super.cleanup();
    this.listenerSetter.removeAll();
    this.progress?.removeListeners();
    this.onPlaybackRackMenuToggle = this.onPip = undefined;
  }

  setupLiveMenu(buttons: ButtonMenuItemOptionsVerifiable[]) {
    this.liveMenuButton = ButtonMenuToggle({
      direction: 'top-left',
      buttons: buttons,
      buttonOptions: {
        noRipple: true
      }
    })
    this.liveMenuButton.classList.add('night');
    this.wrapper.querySelector('.right-controls').prepend(this.liveMenuButton);
  }

  updateLiveViewersCount(count: number) {
    this.wrapper.querySelector('#time-elapsed').textContent = i18n('Rtmp.MediaViewer.Watching', [Math.max(1, count)]).textContent;
  }

  protected _inPip = false;
  get inPip() {
    return this._inPip;
  }
}
