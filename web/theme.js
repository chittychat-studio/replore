// RS24: restore the visitor's saved light/dark choice before the page paints (no flash). With no saved choice (or no
// storage) the page opens in dark (owner 2026-10-25). Per-viewer convenience only.
(function(){ var t=null; try{ t=localStorage.getItem("findrepo_theme"); }catch(e){}
  document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark"); })();
