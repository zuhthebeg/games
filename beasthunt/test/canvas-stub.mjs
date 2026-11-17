// CPU-only CanvasTexture adapter; this does not claim pixel/GPU validation.
export function createCanvasElement(tag) {
 if(tag!=='canvas')throw new Error('Unexpected CPU fixture element: '+tag);
 return {width:0,height:0,getContext(){return {createRadialGradient(){return {addColorStop(){}};},fillRect(){}};}};
}
