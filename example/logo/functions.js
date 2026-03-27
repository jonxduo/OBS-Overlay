function createOverlayThemeController(root, config, helpers){
  console.log('Hi, I am ready!');

  function start(){
    console.log('Start event');
  }

  function stop(){
    console.log('Stop event');
  }

  function restart(){
    console.log('Restart event');
  }
  
  function updateConfig(next){
    console.log('onfig updated:', next);
  }

  return {
    start,
    stop,
    restart,
    updateConfig,
    destroy: function(){
      stop();
    }
  };
}