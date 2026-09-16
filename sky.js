(() => {document.addEventListener("DOMContentLoaded",()=>{const c=window.PARKNACROSS_CONFIG||{},$=id=>document.getElementById(id);$("year").textContent=new Date().getFullYear();
 if(c.skycamImageUrl){$("skyPlaceholder").hidden=true;$("skyImage").hidden=false;const refresh=()=>{$("skyImage").src=c.skycamImageUrl+(c.skycamImageUrl.includes("?")?"&":"?")+"t="+Date.now()};refresh();setInterval(refresh,300000)}
 if(c.skycamTimelapseUrl){$("skyVideo").hidden=false;$("skyVideo").href=c.skycamTimelapseUrl}
 });})();