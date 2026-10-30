export class SceneAssetState {
  constructor(load, destroy, apply) {
    this.load = load;
    this.destroyAsset = destroy;
    this.apply = apply;
    this.generation = 0;
    this.asset = null;
  }

  reset(active) {
    const generation = ++this.generation;
    this.apply(null);
    if (this.asset) this.destroyAsset(this.asset);
    this.asset = null;
    if (!active) return Promise.resolve();
    return Promise.resolve().then(() => this.load()).then(asset => {
      if (generation !== this.generation) this.destroyAsset(asset);
      else {
        this.asset = asset;
        this.apply(asset);
      }
    }).catch(() => {});
  }
}
