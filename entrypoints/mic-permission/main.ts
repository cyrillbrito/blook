// Visible extension page that asks for the mic once. The offscreen document can't show
// the permission prompt, but after it's granted here it applies to the whole extension origin.
import { sendToBackground } from '@/lib/messages';

const status = document.getElementById('status')!;
const button = document.getElementById('allow') as HTMLButtonElement;

async function ask() {
  button.disabled = true;
  status.textContent = 'Waiting for your answer in the browser prompt…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = 'Microphone allowed. Returning to your recording…';
    await sendToBackground({ type: 'mic/permission-granted' });
  } catch (err) {
    const e = err as DOMException;
    status.textContent =
      e?.name === 'NotAllowedError'
        ? 'Microphone blocked. Allow it with the icon in the address bar (or in site settings), then press the button again.'
        : `Could not open the microphone: ${e?.message ?? err}`;
    button.disabled = false;
  }
}

button.addEventListener('click', () => void ask());
void ask();
