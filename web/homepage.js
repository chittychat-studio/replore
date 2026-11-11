"use strict";
// This walkthrough describes the existing flow. It never invokes search or a provider.
(function(){
  // Read the existing pricing configuration; checkout and entitlements stay in pro-core.js.
  if(typeof proConfig==="function"&&typeof proButtons==="function"){
    var pricing=proButtons(proConfig(),location.hostname);
    if(pricing.on){
      document.getElementById("home-pro-offer").hidden=false;
      document.getElementById("home-pro-price").textContent=pricing.month.price;
      document.getElementById("home-pro-year").textContent=pricing.year?pricing.year.price+". "+pricing.offer:"";
    }
  }
  var tabs=Array.from(document.querySelectorAll("[data-journey]"));
  var steps={
    idea:{label:"START WITH THE PROBLEM",heading:"What do you want to build?",description:"Describe the app and the features you need. Choose a prompt above or write your own, then narrow by tech stack or platform.",action:"Describe my idea",href:"#q"},
    repos:{label:"INSPECT THE BUILDING BLOCKS",heading:"Find the fit. Check the trade-offs.",description:"Results come from GitHub. Review the description, language, license and latest code push. Keyword fit highlights matching terms; stars indicate popularity. Open Details to inspect more, and bookmark the repos you want in your plan.",action:"Find repositories",href:"#q"},
    plan:{label:"TAKE YOUR PICKS INTO YOUR AI",heading:"Your choices become a build-plan prompt.",description:"Select repos in the results, then choose Generate plan. Replore assembles a prompt with your selections and optional launch checklists. Copy it or open your own AI assistant to write the plan. This walkthrough does not generate or submit anything.",action:"Start with a search",href:"#q"}
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
