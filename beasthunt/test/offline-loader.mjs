// CPU-only import-map resolver for exact production Three and bh modules.
import fs from 'node:fs';
const base=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',base),'utf8');
const {imports}=JSON.parse(html.split('<script type="importmap">')[1].split('</script>')[0]);
export async function resolve(specifier,context,nextResolve){
 const mapped=imports[specifier]||(specifier.startsWith('three/addons/')?imports['three/addons/']+specifier.slice(13):null);
 if(mapped)return {url:new URL(mapped,base).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
