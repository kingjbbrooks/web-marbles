import { editorLog } from "./log";
import SerializeWorker from "./serialize.worker";
import * as pako from "pako";
import { worldTab } from "./world";
import { prefabsTab } from "./prefabs";
import { modelsTab } from "./models";

function Project() {
	this.mapName = "New map";
	this.authorName = "Unknown";

	this.gameplay = {
		defaultEnterPeriod: 40,
		roundLength: 160,
		timeUntilDnf: 40
	};

	this.models = {};
	this.prefabs = {};
	this.worldObjects = {};

	this.world = {
		waterLevel: -9,
		sunInclination: 0.25
	};
}

Project.prototype.addModel = function(name, fileContents) {
	this.models[name] = {
		file: fileContents,
		convexData: null,
		concaveData: {}
	};
	return this.models[name];
};

Project.prototype.addPrefab = function(uuid) {
	this.prefabs[uuid] = {
		entities: {}
	};
	return this.prefabs[uuid];
};

Project.prototype.addWorldObject = function(uuid, prefabUuid) {
	this.worldObjects[uuid] = {
		prefab: prefabUuid
	};
	return this.worldObjects[uuid];
};

Project.prototype.validateProject = function() {
	// Fix/add any project properties that can easily be fixed
	// This may also help with backward compatibility later

	let validateObject = function(source, template) {
		for(let key in template) {
			if(typeof source[key] !== typeof template[key]) {
				source[key] = template[key];
				console.log(`Reset value for ${key}`);
			}
		}
		for(let key in source) {
			if(typeof source[key] !== typeof template[key]) {
				delete source[key];
				console.log(`Removed unused property ${key}`);
			}
		}
	};
	let template = new Project();
	validateObject(this, template);
	validateObject(this.world, template.world);
	validateObject(this.gameplay, template.gameplay);
};


let projectTab = function() {
	let _worker = new SerializeWorker();
	let _exportActive = 0;
	let _elements = {
		exportPublish: null,
		startArea: null,
		startGate: null,
		finishLine: null,
		gameplayParams: null,
		paramEnterPeriod: null,
		paramMaxRoundLength: null,
		paramWaitAfterFinish: null
	};

	_worker.onmessage = function(message) {
		switch(message.data.type) {
		case "log":
			editorLog(message.data.payload.message, message.data.payload.type);
			break;

		case "error":
			editorLog(`Serialization failed: ${message.data.payload}`, "error");
			_exportActive--;
			break;

		case "publishSuccess": {
			let a = document.createElement("a");
			a.href = message.data.payload.url;
			a.download = message.data.payload.filename;
			document.body.appendChild(a);
			a.click();
			setTimeout(function() {
				document.body.removeChild(a); window.URL.revokeObjectURL(message.data.payload.url);
			}, 0 );
			_exportActive--;
		}
			break;

		default:
			console.log("Unknown worker message", message);
			break;
		}
	};

	_worker.onerror = function(error) {
		editorLog(`Serialization failed: ${error.message}`, "error");
		console.error(`Worker error: ${error.message}`);
		console.error(error);
		_exportActive--;
	};

	return {
		activeProject: null,

		initialize: function() {
			this.activeProject = new Project();

			// Setting elements
			_elements.exportPublish = document.getElementById("exportPublish");
			_elements.startArea = document.getElementById("checkStartArea");
			_elements.startGate = document.getElementById("checkStartGate");
			_elements.finishLine = document.getElementById("checkFinishLine");
			_elements.gameplayParams = document.getElementById("checkGameplayParams");

			_elements.paramEnterPeriod = document.getElementById("paramEnterPeriod");
			_elements.paramMaxRoundLength = document.getElementById("paramMaxRoundLength");
			_elements.paramWaitAfterFinish = document.getElementById("paramWaitAfterFinish");

			// Project button events
			document.getElementById("importProject").addEventListener("click", function() {document.getElementById("importProjectFile").click();}, false);
			document.getElementById("importProjectFile").addEventListener("change", function() {
				let file = this.files[0];
				file.reader = new FileReader();
				file.reader.onload = function() {
					projectTab.importProject(file.reader.result);
				};

				file.reader.onerror = function() {
					editorLog(`Unable to read project file (${file.name}): ${file.reader.error.message}`, "error");
					file.reader.abort();
				};

				file.reader.readAsArrayBuffer(file);
			}, false);
			document.getElementById("exportProject").addEventListener("click", function() {projectTab.exportProject(false, true);}, false);

			// Publish button event
			_elements.exportPublish.addEventListener("click", function() {projectTab.exportProject(true, true);}, false);

			// Change map name
			document.getElementById("paramMapName").addEventListener("change", function() { projectTab.setMapName( this.value ); }, false);
			document.getElementById("paramMapName").addEventListener("input", function() { projectTab.setMapName( this.value ); }, false);

			// Change author name
			document.getElementById("paramAuthorName").addEventListener("change", function() { projectTab.setAuthorName( this.value ); }, false);
			document.getElementById("paramAuthorName").addEventListener("input", function() { projectTab.setAuthorName( this.value ); }, false);

			// Change default enter period
			_elements.paramEnterPeriod.addEventListener("change", function() { projectTab.setEnterPeriod( this.valueAsNumber ); }, false);
			_elements.paramEnterPeriod.addEventListener("input", function() { projectTab.setEnterPeriod( this.valueAsNumber ); }, false);

			// Change maximum round length
			_elements.paramMaxRoundLength.addEventListener("change", function() { projectTab.setMaxRoundLength( this.valueAsNumber ); }, false);
			_elements.paramMaxRoundLength.addEventListener("input", function() { projectTab.setMaxRoundLength( this.valueAsNumber ); }, false);

			// Change time until DNF
			_elements.paramWaitAfterFinish.addEventListener("change", function() { projectTab.setWaitAfterFinish( this.valueAsNumber ); }, false);
			_elements.paramWaitAfterFinish.addEventListener("input", function() { projectTab.setWaitAfterFinish( this.valueAsNumber ); }, false);
		},

		setMapName: function(name) {
			if(!name.length) name = "New map";
			this.activeProject.mapName = name;
		},

		setAuthorName: function(name) {
			if(!name.length) name = "Unknown";
			this.activeProject.authorName = name;
		},

		setEnterPeriod: function(seconds) {
			this.activeProject.gameplay.defaultEnterPeriod = seconds;
			this.checkLevelPublish();
		},

		setMaxRoundLength: function(seconds) {
			this.activeProject.gameplay.roundLength = seconds;
			this.checkLevelPublish();
		},

		setWaitAfterFinish: function(seconds) {
			this.activeProject.gameplay.timeUntilDnf = seconds;
			this.checkLevelPublish();
		},

		checkLevelPublish() {
			let isLevelValid = true;
			let startAreas = 0;
			let startGates = 0;
			let finishLines = 0;
			for(let key in this.activeProject.worldObjects) {
				let worldObject = this.activeProject.worldObjects[key];
				for(let ent in this.activeProject.prefabs[worldObject.prefab].entities) {
					let entity = this.activeProject.prefabs[worldObject.prefab].entities[ent];
					if(entity.type !== "collider") continue; // Check colliders only
					switch(entity.functionality) {
					case "startarea":
						startAreas++;
						break;
					case "startgate":
						startGates++;
						break;
					case "endarea":
						finishLines++;
						break;
					default:
						break;
					}
				}
			}

			if(startAreas === 0) {
				isLevelValid = false;
				_elements.startArea.className = "fail";
				_elements.startArea.textContent = "✘ The level needs a starting area.";
			} else {
				_elements.startArea.className = "success";
				_elements.startArea.textContent = `✔ The level has ${startAreas === 1 ? "a" : startAreas} starting area${startAreas === 1 ? "" : "s"}.`;
			}
			if(startGates === 0) {
				isLevelValid = false;
				_elements.startGate.className = "fail";
				_elements.startGate.textContent = "✘ The level needs a starting gate.";
			} else {
				_elements.startGate.className = "success";
				_elements.startGate.textContent = `✔ The level has ${startGates === 1 ? "a" : startGates} starting gate${startGates === 1 ? "" : "s"}.`;
			}
			if(finishLines === 0) {
				isLevelValid = false;
				_elements.finishLine.className = "fail";
				_elements.finishLine.textContent = "✘ The level needs a finish line.";
			} else {
				_elements.finishLine.className = "success";
				_elements.finishLine.textContent = `✔ The level has ${finishLines === 1 ? "a" : finishLines} finish line${finishLines === 1 ? "" : "s"}.`;
			}

			// Check gameplay parameters. Validity is based on what is considered valid in the HTML
			let validGameplayParams = _elements.paramEnterPeriod.checkValidity()
									&& _elements.paramMaxRoundLength.checkValidity()
									&& _elements.paramWaitAfterFinish.checkValidity();

			if(!validGameplayParams) {
				isLevelValid = false;
				_elements.gameplayParams.className = "fail";
				_elements.gameplayParams.textContent = "✘ The level needs valid gameplay parameters.";
			} else {
				_elements.gameplayParams.className = "success";
				_elements.gameplayParams.textContent = "✔ The level has valid gameplay parameters.";
			}

			_elements.exportPublish.disabled = !isLevelValid;
		},

		exportProject: function(exportAsLevel, useCompression) {
			if(_exportActive > 0) return;

			let serializationStart = new Date();
			editorLog(`Starting export! (${(new Date()) - serializationStart}ms)`);

			// postMessage will copy the data, so we don't have to worry about it being shared
			// We may want to lock the editor controls and do this async in the future
			let payload = projectTab.activeProject;

			_exportActive = 1;
			_worker.postMessage({
				exportType: exportAsLevel ? "publishClient" : "exportProject",
				useCompression: useCompression,
				payload: payload,
				serializationStart: serializationStart
			});
			if(exportAsLevel) {
				_exportActive++;
				_worker.postMessage({
					exportType: "publishServer",
					useCompression: useCompression,
					payload: payload,
					serializationStart: serializationStart
				});
			}
		},

		importProject: function(loadedFile) {
			let loadedProject;
			try {
				let data = pako.inflate(loadedFile);
				let string = new TextDecoder("utf-8").decode(data);
				loadedProject = JSON.parse(string);
			}
			catch(error) {
				editorLog("Unable to load project: Invalid project file.", "error");
				return;
			}

			// Project without these aren't considered valid
			if(typeof loadedProject.models !== "object"
				|| typeof loadedProject.prefabs !== "object"
				|| typeof loadedProject.worldObjects !== "object"
				|| typeof loadedProject.gameplay !== "object"
				|| typeof loadedProject.world !== "object") {
				editorLog("Unable to load project: Missing project properties.", "error");
				return;
			}

			// Clear out current active project
			while(Object.keys(worldTab.worldObjects).length > 0) {
				worldTab.deleteWorldObject(Object.keys(worldTab.worldObjects)[0]);
			}
			while(Object.keys(prefabsTab.prefabs).length > 0) {
				prefabsTab.deletePrefab(Object.keys(prefabsTab.prefabs)[0]);
			}
			while(Object.keys(modelsTab.models).length > 0) {
				modelsTab.removeModel(Object.keys(modelsTab.models)[0]);
			}

			//Initialize loaded project
			editorLog("Loading project...");
			this.activeProject = loadedProject;
			Object.setPrototypeOf(this.activeProject, Project.prototype);
			this.activeProject.validateProject();

			let modelLoaders = [];
			for(let key in this.activeProject.models) {
				modelLoaders.push(
					modelsTab.loadModel(key, this.activeProject.models[key].file, this.activeProject.models[key])
						.catch( error => {return error;})
				);
			}

			// Wait for all models to load before continuing
			let modelPromise = Promise.all(modelLoaders);

			modelPromise.then( (results) => {
				let allSuccesses = true;
				for(let i = 0; i < results.length; i++) {
					if(results[i] === "error") {
						allSuccesses = false;
					}
				}

				for(let uuid in this.activeProject.prefabs) {
					prefabsTab.addPrefab(uuid, this.activeProject.prefabs[uuid]);
				}
				for(let uuid in this.activeProject.worldObjects) {
					if(this.activeProject.worldObjects[uuid].prefab in this.activeProject.prefabs)
						worldTab.addWorldObject(uuid, prefabsTab.prefabs[this.activeProject.worldObjects[uuid].prefab], this.activeProject.worldObjects[uuid]);
					else {
						editorLog(`Unable to load worldObject ${this.activeProject.worldObjects[uuid].name} because prefab with UUID ${this.activeProject.worldObjects[uuid].prefab} doesn't exist.`, "error");
					}
				}

				// Non-model/prefab/object loading
				worldTab.onProjectLoad(this.activeProject);
				document.getElementById("paramMapName").value = this.activeProject.mapName;
				document.getElementById("paramAuthorName").value = this.activeProject.authorName;
				document.getElementById("paramEnterPeriod").value = this.activeProject.gameplay.defaultEnterPeriod;
				document.getElementById("paramMaxRoundLength").value = this.activeProject.gameplay.roundLength;
				document.getElementById("paramWaitAfterFinish").value = this.activeProject.gameplay.timeUntilDnf;

				if(!allSuccesses) {
					editorLog("Not all models loaded correctly. Some prefabs may be affected.", "warn");
				} else {
					editorLog("Project loaded successfully!", "success");
				}
				this.checkLevelPublish();
			}).catch( (error) => {
				editorLog("Project failed to load. Check the console for details.", "error");
				console.error(error);
			} );
		},

		onTabActive: function() {
			worldTab.onTabActive();
			this.checkLevelPublish();
		},

		onTabInactive: function() {
			worldTab.onTabInactive();
		}

	};
}();

export { Project, projectTab };
