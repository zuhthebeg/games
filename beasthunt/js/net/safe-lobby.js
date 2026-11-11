// Instance-local display copy. Raw identity/roster and shared prototype stay intact.
export function safeLobby(lobby) {
  const sync=lobby._syncLobby;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  lobby._syncLobby=function(){
    const raw=this._roster,uid=this.uid,nick=this.nick;
    try {
      this._roster={...raw,players:raw.players?.map(p=>({...p,nick:escape(p.nick||p.user)}))};
      this.nick=escape(nick||uid);
      return sync.call(this);
    } finally {this._roster=raw;this.nick=nick;}
  };
  return lobby;
}
