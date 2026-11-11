"use strict";
// This walkthrough describes the existing flow. It never invokes search or a provider.
(function(){
  // Read the existing pricing configuration; checkout and entitlements stay in pro-core.js.
  if(typeof proConfig==="function"&&typeof proButtons==="function"){
    var pricing=proButtons(proConfig(),location.hostname);
    if(pricing.on){
      document.getElementById("home-pro-offer").hidden=false;
      document.getElementById("home-pro-price").textContent=pricing.month.price;
      document.getElementById("home-pro-year").textContent=pricing.year?pricing.year.price:"";
    }
  }
  var tabs=Array.from(document.querySelectorAll("[data-journey]"));
  var steps={
    idea:{label:"DESCRIBE",heading:"Start with your idea.",description:"Tell us what you need. Use stack and platform filters when you have a preference.",action:"Describe my idea",href:"#q"},
    repos:{label:"DISCOVER",heading:"Check the fit and trade-offs.",description:"Inspect real GitHub results, matching terms, licenses and code activity. Select the repos worth building on.",action:"Find repositories",href:"#q"},
    plan:{label:"BUILD",heading:"Bring your picks to your agent.",description:"Generate a plan prompt with your selected repos. Copy it into your own AI to write the build plan.",action:"Start with a search",href:"#q"}
  };
  function select(tab){
    var step=steps[tab.dataset.journey]; if(!step) return;
    tabs.forEach(function(t){t.setAttribute("aria-selected",String(t===tab));t.tabIndex=t===tab?0:-1;});
    document.getElementById("journey-panel").setAttribute("aria-labelledby",tab.id);
    document.getElementById("journey-label").textContent=step.label;
    document.getElementById("journey-heading").textContent=step.heading;
    document.getElementById("journey-description").textContent=step.description;
    var action=document.getElementById("journey-action"); action.textContent=step.action+" →";action.href=step.href;
  }
  tabs.forEach(function(tab,index){
    tab.addEventListener("click",function(){select(tab);});
    tab.addEventListener("keydown",function(event){
      var next=index;
      if(event.key==="ArrowRight") next=(index+1)%tabs.length;
      else if(event.key==="ArrowLeft") next=(index+tabs.length-1)%tabs.length;
      else if(event.key==="Home") next=0;
      else if(event.key==="End") next=tabs.length-1;
      else return;
      event.preventDefault();tabs[next].focus();select(tabs[next]);
    });
  });
  document.querySelectorAll("[data-home-open]").forEach(function(button){
    button.addEventListener("click",function(){var target=document.getElementById(button.dataset.homeOpen);if(target) target.click();});
  });
  var copy=document.getElementById("copy-agent-setup");
  if(copy) copy.addEventListener("click",async function(){
    var status=document.getElementById("agent-copy-status");
    try{await navigator.clipboard.writeText("/plugin marketplace add chittychat-studio/replore\n/plugin install replore@replore");status.textContent="Install commands copied.";}
    catch(_){status.textContent="Could not copy. Select the commands above and copy them manually.";}
  });
  document.querySelectorAll('a[href="#q"]').forEach(function(link){
    link.addEventListener("click",function(){var q=document.getElementById("q");if(q) q.focus({preventScroll:true});});
  });
})();
