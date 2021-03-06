// -------------------- Globals and Constants -------------
/*global Fuse, THREE, AFRAME, JSZip, Utils*/
let report = {};
let geneList = [];
let currentSearch = '';
const resultElements = ["result1", "result2", "result3"];

// --------------------------------------------------------

// --------------------- HUD ------------------------------

const visibleHeightAtZDepth = ( depth ) => {
  const camera = AFRAME.scenes[0].camera;
  // compensate for cameras not positioned at z=0
  const cameraOffset = camera.position.z;
  if ( depth < cameraOffset ) depth -= cameraOffset;
  else depth += cameraOffset;

  // vertical fov in radians
  const vFOV = camera.fov * Math.PI / 180;

  // Math.abs to ensure the result is always positive
  return 2 * Math.tan( vFOV / 2 ) * Math.abs( depth );
};

const visibleWidthAtZDepth = ( depth ) => {
  const camera = AFRAME.scenes[0].camera;
  const height = visibleHeightAtZDepth( depth, camera );
  let width = height * camera.aspect;
  return width;
};

const setHudPosition = ( fovWidth, fovHeight, depth) => {
  document.getElementById('hud').object3D.position.set(-fovWidth/2 + .25, fovHeight/2 - .25, depth);
}

setHudPosition(visibleWidthAtZDepth(-1), visibleHeightAtZDepth(-1), -1);

// -----------------------------------------------------------

const summonMenus = () => {
  const camera = document.getElementById("curve-camera");
  const start = new THREE.Vector3();
  camera.object3D.getWorldPosition(start);
  const direction = new THREE.Vector3(0, 0, -2);
  direction.applyQuaternion(camera.object3D.quaternion);
  const newPos = new THREE.Vector3();
  newPos.addVectors( start, direction.multiplyScalar( 5 ) );
  const menus = document.getElementById("menuContainer").object3D;
  menus.position.set(newPos.x, newPos.y, newPos.z);
}

// Menu elements won't show up without this.
const initializeMenu = () => {
  document.getElementById("test_input").setAttribute('value', "");
  document.getElementById("result1").setAttribute('value', "");
  document.getElementById("result2").setAttribute('value', "");
  document.getElementById("result3").setAttribute('value', "");
}

const movement = (num) => {
  let direction = new THREE.Vector3();
  const camera = AFRAME.scenes[0].camera;
  camera.getWorldDirection( direction );
  direction.multiplyScalar(num);
  const cameraEl = document.getElementById('rig');
  var pos = cameraEl.getAttribute("position");
  pos.x += direction.x
  pos.y += direction.y
  pos.z += direction.z
  const mapPlayer = document.getElementById('mapPlayer').object3D;
  mapPlayer.position.set((pos.x + direction.x)  * .01, (pos.y + direction.y) * .01, (pos.z + direction.z) * .01);
}

// <-------------------------Abstract-------------------------------->

const viewGene = async (geneFileName, colorField) => {
  const gene = await report.file(geneFileName + ".json").async("string");
  const cellsByGene = JSON.parse(gene);
  cellsByGene.forEach((cell) => {
    paintElement(cell.cell_id, cell[colorField]);
  });
}

const renderAnnotation = (annotation, cellColors) => {
  Object.entries(cellColors[annotation]).forEach(([id, cell]) => {
    paintElement(id, cell.cluster_color);
  });
}

const paintElement = (id, color) => document.getElementById(id).setAttribute("color", color);

// <-------------------------------------------------------------------->

const createCellMetadataObject = (metadata) => {
  // Constant values denoting key does not represent an annotation.
  const ignore_keys = ["cell_id", "color"]

  // Infer available annotations from first cell object
  exampleCell = metadata[0];
  const annotations = [];
  Object.keys(exampleCell).forEach((key) => {
    let ignore = false;
    ignore_keys.forEach((ignore_key) => {
      if (key.includes(ignore_key)) {
        ignore = true;
      }
    });
    if (!ignore) {
      annotations.push(key);
    }
  });

  const annotationObjects = {};
  annotations.forEach((annotation) => {
    annotationObjects[annotation] = {};
    metadata.forEach((cell) => {
      annotationObjects[annotation][cell.cell_id] = {"label": cell[annotation], "label_color": null, "cluster_color": cell[`${annotation}_color`]};
    });
  });
  return [annotations, annotationObjects];
}

// ---------------------------------- Paga --------------------------------

const scalePagaLines = (f) => {
  const line_els = Array.from(document.getElementById("thicklines").children);
  line_els.forEach(line_el => {
    const oldWidth = line_el.getAttribute("meshline").lineWidth;
    line_el.setAttribute("meshline", "lineWidth", f(oldWidth,2));
  })
}

const renderPagaCells = (cells, cellMetadata) => {
  const cellEntities = Array.from(cells.map((cell) => {
    const x = cell.x * .1;
    const y = cell.y * .1;
    const z = cell.z * .1;

    // Colors cells based on the first annotation in the cell metadata object
    const color = cellMetadata[Object.keys(cellMetadata)[0]][cell.cell_id].cluster_color;
    const html_str = `<a-sphere id="${cell.cell_id}" position="${x} ${y} ${z}" radius=".004" color="${color}"></a-sphere>`;
    return Utils.htmlToElement(html_str);
  }));
  document.getElementById('pagacells').append(...cellEntities);
}

const setInitialCameraAndGroundPositionPaga = (nodes) => {
  const yValues = Array.from(Object.values(nodes).map(node => node.xyz.y * .04));
  const xValues = Array.from(Object.values(nodes).map(node => node.xyz.x * .04));
  const xMax = Math.max(...xValues);
  const xMin = Math.min(...xValues);
  const xRange = xMax - xMin;
  const yMax = Math.max(...yValues);
  const yMin = Math.min(...yValues);
  const xMidpoint = (xMax + xMin) / 2;
  const yMidpoint = (yMax + yMin) / 2;

  // Make sure the ground is below the cells
  document.getElementsByClassName('environmentGround')[0].object3D.position.set(0, Math.min(yMin, -12), 0);

  document.getElementById("rig").object3D.position.set(xMidpoint, yMidpoint, xRange + 1);
}

const renderLegend = (annotation, clusterColors) => {
  const legendColors = {};
  Object.values(clusterColors[annotation]).forEach((metadatum) => {
    legendColors[metadatum.label] = metadatum.cluster_color;
  });
  const legend = document.getElementById('legend');
  Object.keys(legendColors).forEach((key) => {
    const el = document.createElement("a-gui-button");
    el.setAttribute("width", "2.5");
    el.setAttribute("height", ".25");
    el.setAttribute("value", key);
    el.setAttribute("font-color", "black");
    el.setAttribute("background-color", legendColors[key]);
    legend.appendChild(el);
  });
}

const initializeAnnotationMenu = (annotations, clusterColors) => {
  const annotation_menu = document.getElementById('annotation_menu');
  annotations.forEach((annotation) => {
    const el = document.createElement("a-gui-button");
    el.setAttribute("width", "2.5");
    el.setAttribute("height", ".5");
    el.setAttribute("value", annotation);
    el.setAttribute("font-color", "white");
    el.setAttribute("margin", "0 0 0.05 0");
    el.addEventListener('click', () => {
      const value = el.getAttribute("value");
      changeAnnotation(value, clusterColors);
    });
    annotation_menu.appendChild(el);
  });
}

const changeAnnotation = (annotation, clusterColors) => {
  const legend = document.getElementById('legend');
  if (legend) {
    Utils.removeElementChildren(document.getElementById('legend'));
    renderLegend(annotation, clusterColors);
  }
  renderAnnotation(annotation, clusterColors);
}

const renderPaga = (edges, nodes, scatter, metadata) => {
  setInitialCameraAndGroundPositionPaga(nodes);
  const branches = [];
  const edgeWeights = {};
  edges.forEach((edge, _) => {
      const edgeId = edge.nodes[0] + '_' + edge.nodes[1];
      if (!branches.includes(edgeId)) {
          branches.push(edgeId);
      }
    edgeWeights[edgeId] = edge.weight;
  });
  const [branch_els, branch_draw_els] = createCurveEnities(branches);
  const [annotations, clusterColors] = createCellMetadataObject(metadata);
  renderLegend(annotations[0], clusterColors);
  initializeAnnotationMenu(annotations, clusterColors);
  const cell_el = document.getElementById("cells");
  const cellEntities = [];
  const nodePositions = {};
  Object.values(nodes).forEach((cell_point, _) => {
    let x = cell_point.xyz.x * .1;
    let y = cell_point.xyz.y * .1;
    let z = cell_point.xyz.z * .1;
    const stream_cell = `<a-sphere text="value: ${cell_point.node_name}; width: 1.5; color: black; align: center; side: double; zOffset: .02" id="${cell_point.node_name}" position="${x} ${y} ${z}" radius=".015" billboard></a-sphere>`;
    nodePositions[cell_point.node_name.replace(/\D/g,'')] = {"x": x, "y": y, "z": z};
    cellEntities.push(Utils.htmlToElement(stream_cell));
  });
  cell_el.append(...cellEntities);
  const thickLines = [];
  branch_els.forEach((branch) => {
    const curveid = branch.getAttribute("id"); 
    const [startNode, endNode] = Utils.strip(curveid).split("_");
    const thickLine = `<a-entity meshline="lineWidth: ${edgeWeights[Utils.strip(curveid)] * 10}; path: ${nodePositions[startNode].x} ${nodePositions[startNode].y} ${nodePositions[startNode].z}, ${nodePositions[endNode].x} ${nodePositions[endNode].y} ${nodePositions[endNode].z}; color: black"></a-entity>`
    thickLines.push(Utils.htmlToElement(thickLine));
  });
  document.getElementById("thicklines").append(...thickLines);
  document.getElementById("thicklinesMap").append(...thickLines.map(el => el.cloneNode()));
  renderPagaCells(scatter, clusterColors);
}

// -------------------------------------------------------------------

// ---------------------- Seurat -------------------------------------

const setInitialCameraAndGroundPositionSeurat = (scatter) => {
  const yValues = Array.from(Object.values(scatter).map(cell => cell.y * .5));
  const xValues = Array.from(Object.values(scatter).map(cell => cell.x * .5));
  const xMax = Math.max(...xValues);
  const xMin = Math.min(...xValues);
  const xRange = xMax - xMin;
  const yMax = Math.max(...yValues);
  const yMin = Math.min(...yValues);
  const xMidpoint = (xMax + xMin) / 2;
  const yMidpoint = (yMax + yMin) / 2;

  // Make sure the ground is below the cells
  document.getElementsByClassName('environmentGround')[0].object3D.position.set(0, Math.min(yMin, -12), 0);

  document.getElementById("rig").object3D.position.set(xMidpoint, yMidpoint, xRange + 1);
}

const renderSeuratCells = (cells, cellMetadata) => {
  const cellEntities = Array.from(cells.map((cell) => {
    const x = cell.x * .5;
    const y = cell.y * .5;
    const z = cell.z * .5;

    // Colors cells based on the first annotation in the cell metadata object
    const color = cellMetadata[Object.keys(cellMetadata)[0]][cell.cell_id].cluster_color;
   
    const html_str = `<a-sphere id="${cell.cell_id}" position="${x} ${y} ${z}" color="${color}" radius=".05" shadow></a-sphere>`;;
    return Utils.htmlToElement(html_str);
  }));
  document.getElementById('pagacells').append(...cellEntities);
}

const renderSeurat = (scatter, metadata) => {
  setInitialCameraAndGroundPositionSeurat(scatter);
  const [annotations, clusterColors] = createCellMetadataObject(metadata);
  renderLegend(annotations[0], clusterColors);
  initializeAnnotationMenu(annotations, clusterColors);
  renderSeuratCells(scatter, clusterColors);
}

//--------------------------------------------------------------------

// ---------------------- STREAM -------------------------------------

const createBranchPoints = (curve) => {
  const curvePoints = [];
  const midpoint = curve.xyz[Math.floor(curve.xyz.length / 2)];
  const labelEntity = document.createElement("a-entity");
  const textValue = `value: ${curve.branch_id}; color:black; align: center; side: double; width: 6`;
  labelEntity.setAttribute("text", textValue);
  const labelPosition = `${midpoint.x * 100} ${midpoint.y * 100} ${midpoint.z * 100}`;
  labelEntity.setAttribute("position", labelPosition);
  labelEntity.setAttribute("billboard", "");
  labelEntity.className = curve.branch_id;
  labelEntity.addEventListener('click', () => {
    currentBranch = curve.branch_id;
  })
  const curveLabels = document.getElementById('curve-labels');
  curveLabels.appendChild(labelEntity);
  curve.xyz.forEach((coord, _) => {
      const curvePoint = `<a-curve-point position="${coord.x * 100} ${coord.y * 100} ${coord.z * 100}"></a-curve-point>`;
      curvePoints.push(Utils.htmlToElement(curvePoint));
  });
  return curvePoints;
}

const setInitialCameraPosition = (curves) => {
  const zMax = getZMax(curves);
  const yValues = Array.from(curves.flatMap((curve) => {
    return Array.from(curve.xyz.map(coord => coord.y));
  }));
  const xValues = Array.from(curves.flatMap((curve) => {
    return Array.from(curve.xyz.map(coord => coord.x))
  }));
  const yMedian = getMedian(yValues) * 100;
  const xMedian = getMedian(xValues) * 100;

  document.getElementsByClassName('environmentGround')[0].object3D.position.set(0, Math.min(...yValues, -12), 0);
  const camera_el = document.getElementById("rig");
  camera_el.object3D.position.set(xMedian, yMedian, zMax + 1.2);
  const mapPlayer = document.getElementById("mapPlayer");
  mapPlayer.object3D.position.set(xMedian * .01, yMedian * .01, (zMax + 1.2) * .01)
}

const createCurveEnities = (branches) => {
  const branch_els = [];
  const branch_draw_els = [];
  branches.forEach((branch, _) => {
      const branch_el = `<a-curve id="${branch}" ></a-curve>`;
      branch_els.push(Utils.htmlToElement(branch_el));
      const branch_draw_el = `<a-draw-curve cursor-listener curveref="#${branch}" material="shader: line; color: black;" geometry="primitive: " ></a-draw-curve>`;
      branch_draw_els.push(Utils.htmlToElement(branch_draw_el));
  });
  return [branch_els, branch_draw_els];
}

const setDrawContainerContent = (branch_els, branch_draw_els) => {
  const branch_container_el = document.getElementById("curve-container");
  branch_container_el.append(...branch_els);
  const map_branch_container = document.getElementById("curve-map");
  map_branch_container.append(...branch_els.map(el => el.cloneNode()));
  const branch_draw_container = document.getElementById("curve-draw");
  branch_draw_container.append(...branch_draw_els);
  const map_draw_container = document.getElementById("draw-map");
  map_draw_container.append(...branch_draw_els.map(el => el.cloneNode()));
}

const renderStream = async (curves, cells, metadata) => {
  setInitialCameraPosition(curves);
  const camvec = new THREE.Vector3();
  const camera = AFRAME.scenes[0].camera;
  camera.getWorldPosition(camvec);
  document.getElementById('draw-map').object3D.lookAt(-camera.position.x, -camera.position.y, -camera.position.z);
  const branches = [];
  curves.forEach((coord, _) => {
      if (!branches.includes(coord.branch_id)) {
          branches.push(coord.branch_id);
      }
  });

  const [branch_els, branch_draw_els] = createCurveEnities(branches);

  setDrawContainerContent(branch_els, branch_draw_els);

  curves.forEach((curve) => {
    const points = createBranchPoints(curve);
    const branch_el = document.getElementById(curve.branch_id);
    branch_el.append(...points);
  })

  const [annotations, clusterColors] = createCellMetadataObject(metadata);
  initializeAnnotationMenu(annotations, clusterColors);

  renderStreamCells(cells, clusterColors);
}

const renderStreamCells = async (cells, clusterColors) => {
  const cellEntities = Array.from(cells.map((cell) => {
    // Colors cells based on the first annotation in the cell metadata object
    const color = clusterColors[Object.keys(clusterColors)[0]][cell.cell_id].cluster_color;
    const html_str = `<a-sphere id="${cell.cell_id}" position="${cell.x * 100} ${cell.y * 100} ${cell.z * 100}" color="${color}" radius=".05" shadow></a-sphere>`;
    return Utils.htmlToElement(html_str);
  }));
  document.getElementById("cells").append(...cellEntities);
}

// -------------------------------------------------------------------

// -------------------------- Camera ---------------------------------

const getZMax = (curves) => {
  let maxZ = Number.NEGATIVE_INFINITY;
  curves.forEach((curve) => {
    curve.xyz.forEach((coord) => {
      if (typeof coord.z !== 'undefined' && Math.abs(coord.z) > maxZ) {
          maxZ = Math.abs(coord.z);
      }
    });
  });
  return maxZ * 100;
}

const getMedian = (values) => {
  const sorted = [...values].sort();
  return sorted[Math.floor(sorted.length/2)];
}

// -------------------------------------------------------------------

const getGeneList = (report) => {
  const allFileNames = Object.keys(report.files);
  const geneNames = [];
  allFileNames.forEach((file) => {
    const splitName = file.split("_");
    if (splitName.length > 1 && splitName[0] === 'gene') {
      geneNames.push({'gene': splitName[1].split('.')[0]})
    }
  });
  return geneNames;
}

const initialize = async (uuid) => {
  const result = await Utils.unzip(uuid);
  report = result;
  if (Object.keys(result.files).includes("paga_nodes.json")) {
    const edges = await result.file("paga_edges.json").async("string");
    const nodes = await result.file("paga_nodes.json").async("string");
    const scatter = await result.file("scatter.json").async("string");
    const metadata = await result.file("metadata.json").async("string");
    renderPaga(JSON.parse(edges), JSON.parse(nodes), JSON.parse(scatter), JSON.parse(metadata));
  } else if (Object.keys(result.files).includes("stream.json")) {
    const streamFile = await result.file("stream.json").async("string");
    const scatterFile = await result.file("scatter.json").async("string");
    const metadataFile = await result.file("metadata.json").async("string");
    document.getElementById('legend').remove();
    renderStream(JSON.parse(streamFile), JSON.parse(scatterFile), JSON.parse(metadataFile));
  } else {
    const scatter = await result.file("scatter.json").async("string");
    const metadata = await result.file("metadata.json").async("string");
    renderSeurat(JSON.parse(scatter), JSON.parse(metadata));
  }
  geneList = getGeneList(result);
  initializeMenu();
}

window.onload = () => {
  const uuid = window.location.href.split("/").slice(-1)[0];
  initialize(uuid);
}

// --------------------- Listeners ----------------------------
document.body.addEventListener('keydown', (e) => {
  var options = {
    shouldSort: true,
    threshold: 0.6,
    location: 0,
    distance: 100,
    maxPatternLength: 32,
    minMatchCharLength: 1,
    keys: [
      "gene",
    ]
  };
  const resultsEntity = document.getElementById("test_input");
  let result1 = '';
  let result2 = '';
  let result3 = '';
  if (e.code === 'Space') {
    summonMenus();
    currentSearch = '';
  } else if (e.key === "Shift") {
    if (Utils.mobilecheck()) {
      const hud = document.getElementById("hud").object3D;
      if (!hud.visible) {
        hud.position.set(0, 0, -.5);
        hud.visible = true;
      }
      document.getElementById("cursor").object3D.visible = false;
    }
  } else if (e.keyCode === 38) {
      movement(.05);
  } else if (e.keyCode === 40) {
      movement(-.05);
  } else if (e.code === 'Enter') {
    currentSearch = '';
  } else if (e.key.length === 1) {
    currentSearch = currentSearch + e.key;
    let fuse = new Fuse(geneList, options);
    let result = fuse.search(currentSearch);
    result1 = result.length > 0 ? result[0].gene : "";
    result2 = result.length > 1 ? result[1].gene : "";
    result3 = result.length > 2 ? result[2].gene : "";

  }
  resultsEntity.setAttribute('text', 'value', "Search: " + currentSearch);
  document.getElementById("result1").setAttribute('text', 'value', result1);
  document.getElementById("result2").setAttribute('text', 'value', result2);
  document.getElementById("result3").setAttribute('text', 'value', result3);
});

document.querySelector('a-scene').addEventListener('enter-vr', () => {
  setHudPosition(visibleWidthAtZDepth(-1) - .5, visibleHeightAtZDepth(-1), -1);
  if (Utils.mobilecheck()) {
    document.getElementById('hud').object3D.visible = false;
    scalePagaLines(Utils.divide);
  }
});

document.querySelector('a-scene').addEventListener('exit-vr', () => {
  setHudPosition(visibleWidthAtZDepth(-1), visibleHeightAtZDepth(-1), -1);
  if (Utils.mobilecheck()) {
    scalePagaLines(Utils.multiply);
  }
});

document.body.addEventListener('keyup', (e) => {
  if (e.key === "Shift") {
    if (Utils.mobilecheck()) {
      const hud = document.getElementById("hud").object3D;
      if (hud.visible) {
        hud.visible = false;
      }
      document.getElementById("cursor").object3D.visible = true;
    }
  }
});

resultElements.forEach((element) => {
  const result = document.getElementById(element);
  result.addEventListener("click", () => {
    viewGene('gene_' + result.getAttribute('text').value, 'color');
  });
});

setInterval(() => {
  const drawContainer = document.getElementById("drawContainer");
  const drawContainerRotation = drawContainer.object3D.rotation;
  const hudMapContainer = document.getElementById("hudMapContainer");
  hudMapContainer.object3D.rotation.set(drawContainerRotation._x, drawContainerRotation._y, drawContainerRotation._z);
}, 50);

document.getElementById("pauseGlobalRotation").addEventListener("click", () => {
  const drawContainer = document.getElementById("drawContainer");
  const isRotating = drawContainer.isPlaying;
  if (isRotating) {
    drawContainer.pause();
    drawContainer.setAttribute("rotation", "0 0 0");
  } else {
    drawContainer.play();
  }
});

// ---------------------------------------------------------------------



