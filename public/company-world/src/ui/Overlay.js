const WORLD_COPY = {
  hub:{title:'Company Hub',description:'The central Beerlao campus connecting every business operation.',kicker:'COMPANY OVERVIEW'},
  office:{title:'Head Office',description:'Departments, executive workspace and company administration.',kicker:'WORLD GATEWAY'},
  warehouse:{title:'Warehouse',description:'Cooler inventory, storage zones and warehouse operations.',kicker:'WORLD GATEWAY'},
  retail:{title:'Retail Network',description:'Retail outlets and cooler installation locations.',kicker:'WORLD GATEWAY'},
  logistics:{title:'Logistics',description:'Truck fleet, dispatch yard and cooler transfers.',kicker:'WORLD GATEWAY'},
  province:{title:'Province Network',description:'Provincial network overview and regional distribution.',kicker:'WORLD GATEWAY'}
};
const $=(id)=>document.getElementById(id);

export class Overlay {
  constructor(){
    this.detail=$('world-detail');this.toastTimer=null;
    this.worldButtons=[...document.querySelectorAll('[data-world]')];
    this.search=$('world-search');
    this.worldNames=[['hub','Company Hub'],['office','Head Office'],['warehouse','Warehouse'],['retail','Retail Network'],['logistics','Logistics'],['province','Province Network']];
  }
  bind({onWorld,onHome,onBack,onZoomIn,onZoomOut,onAtmosphere,onExplore}){
    this.worldButtons.forEach(button=>button.addEventListener('click',()=>onWorld(button.dataset.world)));
    $('camera-home').addEventListener('click',onHome);
    $('zoom-in').addEventListener('click',onZoomIn);
    $('zoom-out').addEventListener('click',onZoomOut);
    $('atmosphere-toggle').addEventListener('click',onAtmosphere);
    $('return-hub').addEventListener('click',onBack);
    $('detail-close').addEventListener('click',()=>this.detail.classList.remove('show'));
    this.search?.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      const q=this.search.value.trim().toLowerCase();
      const match=this.worldNames.find(([,name])=>name.toLowerCase().includes(q));
      if(match){onWorld(match[0]);this.search.blur();}
      else this.toast('No matching world. Try Warehouse, Logistics or Retail.');
    });
  }
  selectWorld(world){
    this.worldButtons.forEach(button=>button.classList.toggle('active',button.dataset.world===world.id));
    $('return-hub').hidden=world.id==='hub';
    const copy=WORLD_COPY[world.id]||WORLD_COPY.hub;
    $('detail-kicker').textContent=copy.kicker;
    $('detail-title').textContent=copy.title;
    $('detail-description').textContent=copy.description;
    $('detail-status').textContent=world.id==='hub'?'COMPANY HUB · ISOMETRIC 3D':'WORLD ENVIRONMENT · INTERACTIVE 3D';
    $('scene-title').textContent=copy.title.toUpperCase();
    if(world.id==='hub')this.detail.classList.remove('show');else this.detail.classList.add('show');
  }
  setMetrics(data){
    $('metric-attention').textContent=data.attention.toLocaleString();
    $('metric-new').textContent=data.new24.toLocaleString();
    const icons={office:'▥',warehouse:'▤',retail:'⌑',logistics:'⇢',province:'⌖'};
    $('world-summary').innerHTML=data.worlds.map(world=>`
      <div class="kpi-world">
        <span class="world-mini-icon">${icons[world.id]||'◇'}</span>
        <div><small>${world.name.toUpperCase()}</small><b>${world.available?world.attention.toLocaleString():'—'}</b></div>
      </div>`).join('');
    $('data-status').textContent='LIVE DATA';
    document.querySelector('.live-state i').style.background='#2ebd79';
  }
  setDataError(error){
    $('data-status').textContent='DATA UNAVAILABLE';
    document.querySelector('.live-state i').style.background='#d99a45';
    $('metric-attention').textContent='—';$('metric-new').textContent='—';
    this.toast(error==='Admin access required'?'Sign in with an Admin account to view live company data.':'3D world loaded; live company data is unavailable.');
  }
  setClock(mode){return mode;}
  toast(message){
    const el=$('toast');el.textContent=message;el.classList.add('show');
    clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
  }
  finishLoading(){$('loading-screen').classList.add('done');setTimeout(()=>$('loading-screen')?.remove(),650);}
}