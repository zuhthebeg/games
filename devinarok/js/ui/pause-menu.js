export function handlePauseKey(code, { loop, partyClient, world, pauseMenu }) {
  if ((!loop && !partyClient) || world?.mode !== 'stage' || !['Escape', 'KeyR'].includes(code)) return false;
  if (pauseMenu.hidden) {
    if (!partyClient) loop?.pause();
    pauseMenu.hidden = false;
  } else {
    pauseMenu.hidden = true;
    if (!partyClient) loop?.resume();
  }
  return true;
}
