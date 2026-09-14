// Background music: a hidden YouTube player that loops one song.
// Browsers block audio until the visitor interacts with the page, so we try
// to start as soon as the player is ready, and retry on every click/key/touch
// until the song is actually playing.

const VIDEO_ID = "UsOGZ65vSlw";
const START_AT = 8; // seconds, also where each loop restarts

let player = null;
let ready = false;
let started = false; // true once the song has really begun playing
let suspended = false; // paused while another video plays in the modal

// the "Music" volume slider in the bottom controls; 0 silences it
const slider = document.getElementById("volume-slider");

function volume() {
  return parseInt(slider.value, 10);
}

function shouldPlay() {
  return volume() > 0 && !suspended;
}

function sync() {
  if (!ready) return;
  player.setVolume(volume());
  if (shouldPlay()) {
    // a play request the browser blocked can leave the player stuck until
    // it's paused once, so reset it before retrying
    if (!started) player.pauseVideo();
    player.playVideo();
  } else {
    player.pauseVideo();
  }
}

slider.addEventListener("input", sync);

// every interaction retries playback until it has started
function unlock() {
  if (!started) sync();
}
for (const type of ["click", "keydown", "touchend"]) {
  window.addEventListener(type, unlock, true);
}

export function pauseMusic() {
  suspended = true;
  sync();
}

export function resumeMusic() {
  suspended = false;
  sync();
}

const holder = document.createElement("div");
holder.id = "music-player";
document.body.appendChild(holder);

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player(holder, {
    width: 200,
    height: 200,
    videoId: VIDEO_ID,
    playerVars: { start: START_AT, controls: 0, playsinline: 1 },
    events: {
      onReady: () => {
        ready = true;
        player.setVolume(volume());
        // try to start right away, with no click: allowed when the browser
        // trusts the site for autoplay (e.g. Chrome after repeat visits, or
        // autoplay set to "Allow" for the site); otherwise the next
        // click/key picks it up
        if (shouldPlay()) player.playVideo();
      },
      onStateChange: (evt) => {
        if (evt.data === YT.PlayerState.PLAYING) started = true;
        // loop by hand: YouTube's own loop would restart at 0:00, not START_AT
        if (evt.data === YT.PlayerState.ENDED) {
          player.seekTo(START_AT, true);
          if (shouldPlay()) player.playVideo();
        }
      },
    },
  });
};

const api = document.createElement("script");
api.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(api);
