  import {sendJsonRequest, GetAttachedUint8Array, pack8bitTo7bit} from "./JsonReplyHandler.js";

  const blockSize = 512;

	const timeIt = true;

// doneCB(path, err, data);
function readFile(readPath, doneCB, progressCB) {

    let startT;
    let endT;
    let startR;
    let endR;

    let stopped = false;
    let byteSize = 0;

    if (timeIt) startT = Date.now();

    let working;
    let highestAskedFor = 0;
    let fileAllRead = false;

    function closeDone(verb, object, data, payoff, zeroX) {
        let resp = object[verb];
        if (doneCB) doneCB(readPath, resp.err, working);
    }

    function closeWithError(fid, err) {
        let clos = {};
        clos.fid = fid;
        sendJsonRequest("close", clos, () => {});
        if (doneCB) doneCB(readPath, err);
    }

    function readCallback(verb, object, data, payoff, zeroX) {
        let resp = object[verb];
        if (fileAllRead) return;
        if (resp.err != 0) {
            closeWithError(resp.fid, resp.err);
            return;
        }

        let attached = GetAttachedUint8Array(data, zeroX);
        let blkadd = resp.addr;

        if (attached.length > 0) {
            working.set(attached, blkadd);
        } else {
            let clos = {};
            clos.fid = resp.fid;
            sendJsonRequest("close", clos, closeDone);
            if (!timeIt) return;
            endT = Date.now();
            let dT = endT - startT;
            console.log("dT: " + dT);
            return;
        }

        let params = {};
        params.fid = resp.fid;
        params.addr = highestAskedFor;
        highestAskedFor += blockSize;
        params.size = blockSize;
        if (progressCB!== undefined) progressCB(highestAskedFor, byteSize);
        sendJsonRequest("read", params, readCallback);
    }

    function openCallback(verb, object, data, payoff, zeroX) {
        let resp = object[verb];

        if (resp.err != 0) {
            if (doneCB !== undefined) doneCB(readPath, resp.err);
            return;
        }
 
        byteSize = resp.size;
        working = new Uint8Array(resp.size);

        highestAskedFor = 0;
        fileAllRead = false;

        console.log("Size: " + resp.size);
        let params = {};
        params.fid = resp.fid;
        params.addr = highestAskedFor;
        params.size = blockSize;
        if (resp.fid === undefined || resp.fid < 1) {
            console.log("*** bad file open");
            if (doneCB !== undefined) doneCB(-1);
            return;
        }
        highestAskedFor += blockSize;
        sendJsonRequest("read", params, readCallback);
    }

    // Kick the process off by openning the file to read.
    let params = {};
    params.path = readPath;
    sendJsonRequest("open", params, openCallback);

    function abortFunction() {
    	stopped = true;
    }

		return abortFunction;
}

function openAndConvert(path) {
    readFile(path, async (pathRead, err, dataRead) => {
        if (err != 0) {
            console.log("Error returned: " + err);
            return;
        }
        if (dataRead == undefined) {
            console.log("Empty File returned to openAndConvert");
            return;
        }
        if (pathRead.toLowerCase().endsWith('wav')) {
            const audioContext = new AudioContext();
            let decoded = await audioContext.decodeAudioData(dataRead.buffer);
            waverly(decoded);
        } else {
            const decoder = new TextDecoder();
            let str = decoder.decode(dataRead);
            editText.value = str;
        }
    });
}




  function zonkUnicode(ins) {
  	let outs = "";
  	for (let i = 0; i < ins.length; ++i) {
  		let aChar = ins.charCodeAt(i);
  		if (aChar > 0 && aChar <= 0x7F)
  			outs += ins[i];
  	}
  	return outs;
  }

// doneCB(err);
function writeToFile(path, fromByteArray, doneCB, progressCB) {
    let toWrite = fromByteArray.length;
    let writtenSoFar = 0;
    let writeOffset = 0;
    let stopped = false;

		function callDone(verb, js) {
		  let resp = js[verb];
			if (doneCB !== undefined) doneCB(resp.err);
		}

    function closeWrite(fid) {
        let clos = {};
        clos.fid = fid;
        sendJsonRequest("close", clos, callDone);
    };

    function writeNext(verb, js, data, payloadOffset, zeroX) {
        let resp = js[verb];
        if (resp.err != 0 || writtenSoFar >= toWrite || stopped) {
            closeWrite(resp.fid);
            return;
        } else {
            writtenSoFar += resp.size;
            let params = {};
            params.fid = resp.fid;
            params.addr = writtenSoFar;
            let sizeToWrite = toWrite - writtenSoFar;
            if (sizeToWrite > blockSize) sizeToWrite = blockSize;
            params.size = sizeToWrite;
            let packed = pack8bitTo7bit(fromByteArray, writtenSoFar, sizeToWrite);
            sendJsonRequest("write", params, writeNext, packed);
            if (progressCB!== undefined) progressCB(writtenSoFar, toWrite);
            return;
        }
    }

    // Kickoff the writing with a fake initial request.
    function postOpen(verb, js, data, payloadOffset, zeroX) {
        let openPB = js[verb];
        if (openPB.err != 0) {
        	console.log("Error opening for writing: " + openPB.err);
        	if (doneCB !== undefined) doneCB(openPB.err);
        	return;
        }
        // create a fake writeNext to start things.
        // if more params are actually used, include them below.
        let kickoff = {
            "dummy": {
                "fid": openPB.fid,
                "size": 0,
                "err": 0
            }
        };
        writeNext("dummy", kickoff);
    }

    let oparams = {};
 
    let cleaner = zonkUnicode(path.replace('//', '/'));
    console.log(cleaner);
    oparams.path = cleaner;
    
    function abortFunction() {
    	stopped = true;
    }

    oparams.write = 1;
    sendJsonRequest("open", oparams, postOpen);

    return abortFunction;
}



 	function ping() {
 		 let pingCtr= 100;
 		 let startT;
 		 let params = {};

 		 function reping() {
 	 	 	pingCtr--;
	 	 	if (pingCtr > 0) {
	 	 		 	 sendJsonRequest("ping", params, reping);
	 	 	} else {
	 	 		if (timeIt) {
	 	 			let endT = Date.now();
	 	 			let dT = endT - startT;
					console.log("dT: " + dT);
				}
	 	 	}
	 	 	 //console.log("pong " + pingCtr);	 
 		 };
 		 if (timeIt) startT = Date.now();
	 	 sendJsonRequest("ping", params, reping);
 	}
 
 	const linesPerRequest = 20;

// dirDoneCB(err, entriesArray);
	function getDirInfo(dirpath, dirDoneCB) {
	    let working = [];

	    let dirCB = function(verb, object, data, payoff) {
	        let resp = object[verb];
	        if (resp.err !== undefined && resp.err != 0) {
	            console.log("getDirInfo error: " + resp.err);
	            if (dirDoneCB !== undefined) dirDoneCB(resp.err);
	            return;
	        }
	        working = working.concat(resp.list);
	        if (resp.list !== undefined && resp.list.length > 0) {
	            let params = {
	                offset: working.length,
	                lines: linesPerRequest,
	                path: dirpath
	            };
	            sendJsonRequest("dir", params, dirCB);
	        } else {
	        		if (dirDoneCB !== undefined) dirDoneCB(resp.err, working);
	        }
	    }

	    let params = {
	        offset: 0,
	        lines: linesPerRequest,
	        path: dirpath
	    };

	    sendJsonRequest("dir", params, dirCB);
	}

function deleteOneItem(path) {
	let { promise, resolve, reject } = Promise.withResolvers();

  let del = {path: path};
  sendJsonRequest("delete", del,(verb, object, data, payoff, zeroX)=>{
  let params = object[verb];
  if (params.err !== 0) {
  		reject(params.err);
  } else {
  		resolve(path)
   }
  });

  console.log("Deleting one item: " + path);
	resolve();
	return promise;
}

async function recursiveDelete(path, isDir) {
	  let { promise, resolve, reject } = Promise.withResolvers();
		if (!isDir) {
			await deleteOneItem(path);
			resolve(path);
		} else {
			getDirInfo(path, async (err, dirList) => {
				for (const de of dirList) {
					let fullPath = path + "/" + de.name;
					if (de.attr & 0x10) {
						await recursiveDelete(fullPath, true);
					} else {
						await deleteOneItem(fullPath);
					}
				}
				await deleteOneItem(path);
				resolve(path);
		});
		}
	  return promise;
}


function getRidOfDoubleLeadingSlashes(ins) {
	if (ins.startsWith("//")) return ins.substring(1);
	return ins;
}

function filenamePartOnly(ins) {
	let spltz = ins.split("/");
	if (spltz.length > 0) return spltz[spltz.length - 1];
	return ins;
}

export {readFile, openAndConvert, writeToFile, ping, recursiveDelete, getDirInfo, getRidOfDoubleLeadingSlashes, filenamePartOnly}
