import jingleUrl from '../jingle.mp3';

const SOUNDS = {
  startup: jingleUrl,
  success: jingleUrl,
  click: 'https://www.soundjay.com/buttons/button-16.mp3'
};

export const playSound = (type: keyof typeof SOUNDS) => {
  const isMuted = localStorage.getItem('cardoc_muted') === 'true';
  if (isMuted) {
    console.log(`Sound [${type}] skipped: Muted`);
    return;
  }

  const url = SOUNDS[type];
  if (!url) {
     console.warn(`Sound [${type}] skipped: URL not found`);
     return;
  }

  console.log(`Playing [${type}] from: ${url}`);
  const audio = new Audio(url);
  audio.volume = 0.6;
  audio.play()
    .then(() => console.log(`Sound [${type}] played successfully`))
    .catch(e => {
      console.error(`Sound [${type}] play failed:`, e.name, e.message);
      if (e.name === 'NotAllowedError') {
        console.warn("Autoplay blocked. User must interact with the document first.");
      }
    });
};
