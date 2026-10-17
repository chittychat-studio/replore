// RS24: restore the visitor's saved light/dark choice before the page paints (no flash). With no saved choice the
// root has no data-theme, so the CSS follows the system's prefers-color-scheme. Per-viewer convenience only.
(function(){ try{ var t=localStorage.getItem("findrepo_theme"); if(t==="dark"||t==="light") document.documentElement.setAttribute("data-theme",t); }catch(e){} })();
