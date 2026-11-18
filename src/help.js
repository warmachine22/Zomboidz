import { GUNS, isSupply, LOOT, UPGRADES } from './simulation.js';

const descriptions = {
  ammo: 'Adds spare rounds to the reserve shared by your firearms.',
  flareAmmo: 'Adds cartridges for the flare gun. Fired flares draw nearby zombies for up to ten seconds.',
  pistol: 'Your six-round starting sidearm. Fires one aimed shot per pull.',
  shotgun: 'Fires a spread of pellets for close encounters. Its base capacity is four shells.',
  smg: 'Fires automatically while you hold the trigger. Its base magazine holds 24 rounds.',
  carbine: 'Fires precise single shots at longer range. Its base magazine holds 16 rounds.',
  damage: 'Increases firearm damage by 15% of base damage per tier.',
  pierce: 'Lets shots pass through one more zombie per tier. The shot loses damage as it passes through.',
  reload: 'Reduces reload time by 15% per tier.',
  battery: 'Adds eight seconds of flashlight runtime per tier.',
  lens: 'Adds three metres of flashlight reach per tier.',
  capacity: 'Increases every firearm’s magazine capacity. The next reload fills the new space from your reserve.',
  radioPart: 'Collect five different components from shelters, then call for extraction from your field map.',
};

const groups = [
  { title:'Ammo', kinds:Object.keys(LOOT).filter(isSupply) },
  { title:'Armor', kinds:Object.keys(LOOT).filter(kind=>kind.startsWith('armor')) },
  { title:'Weapons', kinds:Object.keys(GUNS).filter(kind=>Object.hasOwn(LOOT,kind)) },
  { title:'Run upgrades', kinds:Object.keys(UPGRADES) },
  { title:'Extraction', kinds:['radioPart'] },
];

function describe(kind) {
  if (kind.startsWith('armor')) {
    const hits = Number(kind.at(-1));
    return hits === 1 ? 'Absorbs one hit.' : 'Absorbs up to ' + hits + ' hits.';
  }
  const upgrade = UPGRADES[kind];
  return descriptions[kind] + (upgrade ? ' Stacks up to ' + upgrade.cap + ' times.' : '');
}

export function fillHelp(panel, pickupImage) {
  for (const photo of panel.querySelectorAll('[data-guide-photo]'))
    photo.src = new URL('./assets/guide/' + photo.dataset.guidePhoto + '.webp',import.meta.url).href;

  const content = panel.querySelector('#help-inventory');
  for (const { title, kinds } of groups) {
    const group = document.createElement('section');
    const heading = document.createElement('h4');
    heading.textContent = title;
    const list = document.createElement('ul');
    list.className = 'help-items';
    for (const kind of kinds) {
      const item = document.createElement('li');
      const icon = new Image(76,76);
      icon.src = pickupImage(kind);
      icon.alt = '';
      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = LOOT[kind].name;
      const description = document.createElement('p');
      description.textContent = describe(kind);
      details.append(name,description);
      item.append(icon,details);
      list.append(item);
    }
    group.append(heading,list);
    content.append(group);
  }
}
