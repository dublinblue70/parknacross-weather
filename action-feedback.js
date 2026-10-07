(() => {
 'use strict';const busy=new WeakSet();
 window.ParknacrossAction={begin(button,label='Working…'){if(!button)return()=>{};if(busy.has(button))return null;busy.add(button);const text=button.textContent;button.disabled=true;button.textContent=label;button.setAttribute('aria-busy','true');return()=>{busy.delete(button);button.disabled=false;button.textContent=text;button.setAttribute('aria-busy','false');};}};
})();
