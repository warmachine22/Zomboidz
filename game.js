import('./src/game.js?v=0.10').catch(e=>{
 console.error('Zomboidz failed to load:',e);
 document.getElementById('startlabel').textContent='GAME LOAD ERROR';
 document.getElementById('start').disabled=true;
 document.getElementById('toast').textContent='Could not load the game. Refresh or update your browser and try again.';
 document.getElementById('toast').classList.add('on');
});
