/**
	This script adds a constructor function to the THREE object that generates a camera with WASD / 
	arrow keys fly controls. 
	
	The constructor takes the following arguments:
	- scene		THREE scene object to add the camera to
	- renderer	THREE renderer the camera should use
	- options	[OPTIONAL] Options object:
		- pointerLockElement	Element to use for pointerlock. Will be renderer.domElement by
								default
		- camera				THREE camera to use for applying controls to. Will generate new camera by
								default.
		- speed					Fly control speed. Can be changed afterwards. 150 by default.
		- disableOnBlur			Boolean. Whether to disable camera on tabbing out. true by default.
		
	Methods:
	enable()		Enables the controls.
	disable()		Disables the controls.
	update()		Updates the controls. Should be called in some update loop.
 */

if (!THREE.webMarbles) THREE.webMarbles = {};

(()=>{
	let addRegisteredEventListener = function(scope, event, func, capture){
		scope.addEventListener(event, func, capture);
		return () => {
			scope.removeEventListener(event, func, capture);    
		};
	}
		
	THREE.webMarbles.cameraFlyControls = function(
		scene,
		renderer,
		options
	){
		if (!options)
			var options = {};
		
		if (!options.pointerLockElement)
			options.pointerLockElement = renderer.domElement;
		
		if (!options.camera)
			options.camera = new THREE.PerspectiveCamera( 
				75, renderer.domElement.clientWidth / renderer.domElement.clientHeight, 0.1, 5000 
			);
			
		if (!options.speed)
			options.speed = 150;
		
		if (!options.disableOnBlur)
			options.disableOnBlur = true;
		
		console.log(scene,renderer,options.pointerLockElement,options.camera);
		
		this.pointerLockElement = options.pointerLockElement;
		this.camera = options.camera;
		this.speed = options.speed;
		
		this.moveForward = false;
		this.moveBackward = false;
		this.moveLeft = false;
		this.moveRight = false;

		this.prevTime = performance.now();
		this.velocity = new THREE.Vector3();
		this.direction = new THREE.Vector3();
		
		let listeners = [];
		this.enable = function(){
			this.enabled = true;
			let func;
			
			// Hook pointer lock state change events		
			func = function(event){
				// document.pointerLockElement is null if pointerlock is inactive
				if (document.pointerLockElement === options.pointerLockElement) {
					controls.enabled = true;
				} else {
					controls.enabled = false;
					stop();
				}
			}
			listeners.push( addRegisteredEventListener(document, "pointerlockchange", func, false) );

			// Warn for pointerlock errors
			func = function(event){
				console.warn("Pointer lock error:",event);
			};
			listeners.push( addRegisteredEventListener(document, "pointerlockerror", func, false) );

			// Request pointerlock
			func = function(event){
				options.pointerLockElement.requestPointerLock();
			};
			listeners.push( addRegisteredEventListener(renderer.domElement, "mousedown", func, false) );

			// Release pointerlock
			func = function(event){
				document.exitPointerLock();
			}
			listeners.push( addRegisteredEventListener(document, "mouseup", func, false) );

			// Movement keys
			func = function(event){
				let bool;
				if (event.type === "keydown") {
					bool = true;
				} else if (event.type === "keyup") {
					bool = false;
				}

				// Test keyCode
				switch(event.keyCode){
					case 38: // up
					case 87: // w
						this.moveForward = bool;
						break;

					case 37: // left
					case 65: // a
						this.moveLeft = bool;
						break;

					case 40: // down
					case 83: // s
						this.moveBackward = bool;
						break;

					case 39: // right
					case 68: // d
						this.moveRight = bool;
						break;
				}
			};

			listeners.push( addRegisteredEventListener(document, "keydown", func.bind(this), false) );
			listeners.push( addRegisteredEventListener(document, "keyup", func.bind(this), false) );
		
			this.update = function(){ 
				update.bind(this)();
			}
		}
		
		this.disable = function(){
			this.enabled = false;
			
			stop();
			
			// remove listeners
			listeners.forEach((el)=>{
				el();
			});
			
			// null update function
			this.update = () => void 0;
		}
			
		if (options.disableOnBlur === true){
			document.addEventListener("visibilitychange",(function(){
				if (document.hidden)
					this.disable();
				else
					this.enable();
			}).bind(this),false);
		}
		
		let stop = (function(){
			this.velocity.x = 0;
			this.velocity.y = 0;
			this.velocity.z = 0;
			
			this.moveForward = false;
			this.moveBackward = false;
			this.moveLeft = false;
			this.moveRight = false;
		}).bind(this);

		let controls = this.controls = new THREE.PointerLockControls(options.camera);

		controls.getObject().position.x = -2.3;
		controls.getObject().position.y = 12;
		controls.getObject().position.z = 19.7;

		controls.getObject().rotation.z = 0;

		options.camera.parent.rotation.x = -.3;

		scene.add(controls.getObject());
		
		// Call this function in the update loop to update the controls.
		let time, delta;
		let update = function(){
			time = performance.now();
			delta = ( time - this.prevTime ) / 1000;

			this.velocity.x -= this.velocity.x * 10.0 * delta;
			this.velocity.y -= this.velocity.y * 10.0 * delta;
			this.velocity.z -= this.velocity.z * 10.0 * delta;

			this.direction.z = Number( this.moveForward ) - Number( this.moveBackward );
			this.direction.y = Number( this.moveForward ) - Number( this.moveBackward );
			this.direction.x = Number( this.moveLeft ) - Number( this.moveRight );
			this.direction.normalize(); // this ensures consistent movements in all directions

			if ( this.controls.enabled === true ) {
				if ( this.moveForward || this.moveBackward )
					this.velocity.z -= this.direction.z * this.speed * delta;
				
				if ( this.moveForward || this.moveBackward )
					this.velocity.y -= this.direction.y * this.speed * delta *
						(-this.camera.parent.rotation.x * Math.PI*.5);
				
				if ( this.moveLeft || this.moveRight )
					this.velocity.x -= this.direction.x * this.speed* delta;
			}
			controls.getObject().translateX( this.velocity.x * delta );
			controls.getObject().translateY( this.velocity.y * delta );
			controls.getObject().translateZ( this.velocity.z * delta );

			this.prevTime = time;
		}
		
		this.enable();
	}
})();