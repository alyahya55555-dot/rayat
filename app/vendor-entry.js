// حزمة المكتبات: three وإضافاته المستعملة وd3-delaunay، تُكشف على window
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Delaunay } from 'd3-delaunay';
window.THREE = THREE; window.RoomEnvironment = RoomEnvironment; window.d3 = { Delaunay };
