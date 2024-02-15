import { Geolocation, Map, Overlay, View } from 'https://esm.sh/ol@8.2.0?bundle-deps'
import LineString from 'https://esm.sh/ol@8.2.0/geom/LineString.js?bundle-deps';
import OSM from 'https://esm.sh/ol@8.2.0/source/OSM.js?bundle-deps';
import TileLayer from 'https://esm.sh/ol@8.2.0/layer/Tile.js?bundle-deps';
import { fromLonLat } from 'https://esm.sh/ol@8.2.0/proj.js?bundle-deps';
import {
    DragRotateAndZoom,
    defaults as defaultInteractions,
    DblClickDragZoom,
} from 'https://esm.sh/ol@8.2.0/interaction.js?bundle-deps';
import { Zoom } from 'https://esm.sh/ol@8.2.0/control.js?bundle-deps';
import getBrowserFingerprint from 'https://esm.sh/get-browser-fingerprint@3.2.0'

const fingerprint = getBrowserFingerprint({enableWebgl:true});
// console.log(fingerprint);
const markerEl = document.getElementById('geolocation_marker');
const bits = (fingerprint).toString(2).padStart(32,0).substring(8)
const r = Number.parseInt(bits.substring(0,8), 2);
const g = Number.parseInt(bits.substring(8,16), 2);
const b = Number.parseInt(bits.substring(16), 2);
// debugger;
// document.body.style.backgroundColor = `#${r}${g}${b}`
markerEl.querySelector('circle').setAttribute('fill', `rgb(${r},${g},${b})`)


const track_location_button = document.getElementById('track_location');
let track_location = false;
track_location_button.addEventListener('click', () => {
    track_location = !track_location;
    if (track_location) {
        track_location_button.textContent = "Stop tracking my location"
    } else {
        track_location_button.textContent = "Track my location"
    }
})

const recentre = document.getElementById('recentre');
const wake = document.getElementById('wake');
let north = document.getElementById('north')

let evtSource;
let url = new URL(window.location)
let searchParams = new URLSearchParams(url.hash.slice(1))
let channel = searchParams.get('channel')
let key = searchParams.get('key')
let newChannel = false;
if (key) {
    key = await window.crypto.subtle.importKey(
        "jwk",
        {
            k: key,
            alg: "A128GCM",
            ext: true,
            key_ops: ["encrypt", "decrypt"],
            kty: "oct",
        },
        { name: "AES-GCM", length: 128 },
        true, // extractable
        ["decrypt", "encrypt"],
    );
}
if (!channel || !key) {
    newChannel = true;
    channel = crypto.randomUUID()
    searchParams.set('channel', channel)
    key = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 128 },
        true, // extractable
        ["encrypt", "decrypt"],
    );
    const objectKey = (await window.crypto.subtle.exportKey("jwk", key)).k;
    searchParams.set('key', objectKey)

    url.hash = searchParams.toString()

    history.pushState({}, "", url);
}

// creating the view
const view = new View({
    center: [0, 0],
    zoom: 1,
});

const tileLayer = new TileLayer({
    source: new OSM(),
});

// creating the map
const map = new Map({
    interactions: defaultInteractions().extend([new DragRotateAndZoom(), new DblClickDragZoom()]),
    layers: [tileLayer],
    target: 'map',
    view: view,
    controls: [new Zoom()]
});

// Geolocation marker
const marker = new Overlay({
    positioning: 'center-center',
    element: markerEl,
    stopEvent: false,
});

let recentre_target = marker;

function recentre_on_marker(event) {
    view.setCenter(event.target.getPosition())
}

marker.getElement().addEventListener('click', () => {
    view.setCenter(marker.getPosition())
    recentre.hidden = true;
    marker.on('change:position', recentre_on_marker)
})
marker.on('change:position', recentre_on_marker)
map.addOverlay(marker);

map.on('pointerdrag', function () {
    recentre.hidden = false;
    marker.un('change:position', recentre_on_marker)
});
recentre.addEventListener('click', () => {
    view.setCenter(recentre_target.getPosition())
    recentre_target.on('change:position', recentre_on_marker)
    recentre.hidden = true;
})
view.on('change:rotation', function () {
    if (view.getRotation() !== 0) { north.hidden = false; } else {
        north.hidden = true
    }
    north.style.setProperty('--rotation', radToDeg(view.getRotation()));
});
north.addEventListener('click', () => {
    north.hidden = true;
    view.setRotation(0);
})
let zoomout = document.querySelector('.ol-zoom-out')
zoomout.parentNode.insertBefore(north, zoomout.nextSibling)

let wakeLockObj = null;
const handleVisibilityChange = () => {
    if (wakeLockObj !== null && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen')
            .then((wakeLock) => {
                wakeLockObj = wakeLock;

                wakeLockObj.addEventListener('release', () => {
                    wakeLockObj = null;
                })

                wake.textContent = 'Stop keeping screen on';
            })
            .catch((err) => {
                console.error(err);
                wake.textContent = 'Failed to keep screen on';
            })
    }
};
wake.addEventListener('click', () => {
    if ("wakeLock" in navigator) {
        if (wakeLockObj) {
            wakeLockObj.release();
            wakeLockObj = null;
            wake.textContent = 'Keep screen on';
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        } else {
            navigator.wakeLock.request('screen')
                .then((wakeLock) => {
                    wakeLockObj = wakeLock;

                    wakeLockObj.addEventListener('release', () => {
                        wakeLockObj = null;
                    })

                    wake.textContent = 'Stop keeping screen on';
                    document.addEventListener('visibilitychange', handleVisibilityChange);
                })
                .catch((err) => {
                    console.error(err);
                    wake.textContent = 'Failed to keep screen on';
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                })
        }
    }
})

// LineString to store the different geolocation positions. This LineString
// is time aware.
// The Z dimension is actually used to store the rotation (heading).
const positions = new LineString([], 'XYZM');

// function center() {
//     // use sampling period to get a smooth transition
//     let m = Date.now() - deltaMean * 1.5;
//     m = Math.max(m, previousM);
//     previousM = m;
//     // interpolate position along positions LineString
//     const c = positions.getCoordinateAtM(m, true);
//     if (c) {
//         // view.setZoom(18);
//         // view.setCenter(getCenterWithHeading(c, -c[2], view.getResolution()));
//         view.setCenter(c);
//     } else {
//         view.setCenter([0, 0]);
//     }
// }

// function throttle(delay, mainFunction) {
//     let timerFlag = null; // Variable to keep track of the timer

//     // Returning a throttled version
//     return (...args) => {
//         if (timerFlag === null) { // If there is no timer currently running
//             mainFunction(...args); // Execute the main function
//             timerFlag = setTimeout(() => { // Set a timer to clear the timerFlag after the specified delay
//                 timerFlag = null; // Clear the timerFlag to allow the main function to be executed again
//             }, delay);
//         }
//     };
// }

// Geolocation Control
const geolocation = new Geolocation({
    projection: view.getProjection(),
    trackingOptions: {
        enableHighAccuracy: true,
    },
});

let deltaMean = 500; // the geolocation sampling period mean in ms

// Listen to position changes
geolocation.on('change', /*throttle(1000,*/ async function () {
    const position = geolocation.getPosition();
    const accuracy = geolocation.getAccuracy();
    const heading = geolocation.getHeading() || 0;
    const speed = geolocation.getSpeed() || 0;
    const m = Date.now();

    const coords = positions.getCoordinates();
    const len = coords.length;
    if (len >= 2) {
        deltaMean = (coords[len - 1][3] - coords[0][3]) / (len - 1);
    }

    const data = {
        position,
        accuracy,
        heading,
        speed,
        m,
        deltaMean
    }

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const encrypted = new Uint8Array(await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(JSON.stringify(data)),
    ));

    try {
        let res = await fetch(`/update`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                channel,
                encrypted,
                iv
            })
        });
        if (!res.ok) {
            let { position, accuracy, heading, speed, m, deltaMean } = data;
            addPosition(position, heading, m, speed);

            updateView()
        }
    } catch {
        let { position, accuracy, heading, speed, m, deltaMean } = data;
        addPosition(position, heading, m, speed);

        updateView()
    }
})/*)*/;

geolocation.on('error', function () {
    // TODO we should remove the coordinates in positions
});

// convert radians to degrees
function radToDeg(rad) {
    return (rad * 360) / (Math.PI * 2);
}
// convert degrees to radians
function degToRad(deg) {
    return (deg * Math.PI * 2) / 360;
}
// modulo for negative values
function mod(n) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

function addPosition(position, heading, m, speed) {
    const x = position[0];
    const y = position[1];
    const fCoords = positions.getCoordinates();
    const previous = fCoords[fCoords.length - 1];
    const prevHeading = previous && previous[2];
    if (prevHeading) {
        let headingDiff = heading - mod(prevHeading);

        // force the rotation change to be less than 180°
        if (Math.abs(headingDiff) > Math.PI) {
            const sign = headingDiff >= 0 ? 1 : -1;
            headingDiff = -sign * (2 * Math.PI - Math.abs(headingDiff));
        }
        heading = prevHeading + headingDiff;
    }
    positions.appendCoordinate([x, y, heading, m]);

    // only keep the 20 last coordinates
    positions.setCoordinates(positions.getCoordinates().slice(-20));

    if (heading && speed) {
        markerEl.src = '/geolocation_marker_heading.png';
    } else {
        markerEl.src = '/geolocation_marker.png';
    }
}

let previousM = 0;
let first = true;
function updateView() {
    // use sampling period to get a smooth transition
    let m = Date.now() - deltaMean * 1.5;
    m = Math.max(m, previousM);
    previousM = m;
    // interpolate position along positions LineString
    const c = positions.getCoordinateAtM(m, true);
    if (c) {
        if (first) {
            view.setZoom(18);
            first = false;
        }
        marker.setPosition(c);
        map.render();
    }
}

// geolocate device
function go() {
    geolocation.setTracking(true);
    updateView()

    map.render();
}

const source = `/stream/sse?channel=${channel}`

function setupEventSource() {
    evtSource = new EventSource(source);
    evtSource.addEventListener("open", async() => {
        if (newChannel) {
            go()
        }
    })
    evtSource.addEventListener("update", async (event) => {
        let { iv, encrypted } = JSON.parse(event.data);
        iv = new Uint8Array(Object.values(iv))
        encrypted = new Uint8Array(Object.values(encrypted))

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            encrypted,
        );
        const decoded = new TextDecoder().decode(new Uint8Array(decrypted));
        const data = JSON.parse(decoded);

        let { position, accuracy, heading, speed, m, deltaMean } = data;
        addPosition(position, heading, m, speed);

        updateView()
    });
    evtSource.onerror = function (e) {
        console.error(e)
        evtSource.close();
        setupEventSource();
    };
}
setupEventSource();

// Share must be triggered by "user activation"
window.share_link.addEventListener("click", async () => {
    window.dialog.close()
    try {
        await navigator.share({
            title: " ",
            text: "Here's my location —",
            url: location.href
        });
    } catch (err) {
        console.error(err);
    }
});

// const simulationData = [
//     {
//         "coords": {
//             "speed": 1.7330950498580933,
//             "accuracy": 5,
//             "altitudeAccuracy": 8,
//             "altitude": 238,
//             "longitude": 5.868668798362713,
//             "heading": 67.5,
//             "latitude": 45.64444874417562
//         },
//         "timestamp": 1394788264972
//     }, {
//         "coords": {
//             "speed": 1.9535436630249023,
//             "accuracy": 5,
//             "altitudeAccuracy": 8,
//             "altitude": 238,
//             "longitude": 5.868715401744348,
//             "heading": 69.609375,
//             "latitude": 45.64446391542036
//         },
//         "timestamp": 1394788266115
//     }, {
//         "coords": {
//             "speed": 2.1882569789886475,
//             "accuracy": 10,
//             "altitudeAccuracy": 8,
//             "altitude": 238,
//             "longitude": 5.868768962105614,
//             "heading": 67.5,
//             "latitude": 45.644484995906836
//         },
//         "timestamp": 1394788267107
//     }, {
//         "coords": {
//             "speed": 2.4942498207092285,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 237,
//             "longitude": 5.868825791409117,
//             "heading": 68.5546875,
//             "latitude": 45.64450435810316
//         },
//         "timestamp": 1394788267959
//     }, {
//         "coords": {
//             "speed": 2.7581217288970947,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 237,
//             "longitude": 5.868881698703271,
//             "heading": 69.609375,
//             "latitude": 45.64452149909515
//         },
//         "timestamp": 1394788268964
//     }, {
//         "coords": {
//             "speed": 3.3746347427368164,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 236,
//             "longitude": 5.868938528006774,
//             "heading": 70.3125,
//             "latitude": 45.644536712249405
//         },
//         "timestamp": 1394788270116
//     }, {
//         "coords": {
//             "speed": 3.597411870956421,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 236,
//             "longitude": 5.868992004549009,
//             "heading": 74.8828125,
//             "latitude": 45.644547943999655
//         },
//         "timestamp": 1394788271158
//     }, {
//         "coords": {
//             "speed": 3.6382505893707275,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 236,
//             "longitude": 5.869038775568706,
//             "heading": 73.828125,
//             "latitude": 45.64456005584974
//         },
//         "timestamp": 1394788271893
//     }, {
//         "coords": {
//             "speed": 3.65671443939209,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 236,
//             "longitude": 5.869091162463528,
//             "heading": 73.4765625,
//             "latitude": 45.644572335337884
//         },
//         "timestamp": 1394788272903
//     }, {
//         "coords": {
//             "speed": 3.7153592109680176,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 236,
//             "longitude": 5.869144219910604,
//             "heading": 73.125,
//             "latitude": 45.64458671030182
//         },
//         "timestamp": 1394788273914
//     }, {
//         "coords": {
//             "speed": 3.8041043281555176,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 236,
//             "longitude": 5.869205072527629,
//             "heading": 72.421875,
//             "latitude": 45.64460313883204
//         },
//         "timestamp": 1394788274901
//     }, {
//         "coords": {
//             "speed": 3.9588162899017334,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 236,
//             "longitude": 5.869268858810765,
//             "heading": 72.421875,
//             "latitude": 45.64461990263838
//         },
//         "timestamp": 1394788276140
//     }, {
//         "coords": {
//             "speed": 4.152309417724609,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 235,
//             "longitude": 5.869351252918941,
//             "heading": 78.046875,
//             "latitude": 45.64466122542102
//         },
//         "timestamp": 1394788276948
//     }, {
//         "coords": {
//             "speed": 4.49971866607666,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 236,
//             "longitude": 5.869433479389054,
//             "heading": 79.8046875,
//             "latitude": 45.64467040360499
//         },
//         "timestamp": 1394788277892
//     }, {
//         "coords": {
//             "speed": 4.824056148529053,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 235,
//             "longitude": 5.869504055013758,
//             "heading": 91.40625,
//             "latitude": 45.64466089014489
//         },
//         "timestamp": 1394788279211
//     }, {
//         "coords": {
//             "speed": 5.269814491271973,
//             "accuracy": 10,
//             "altitudeAccuracy": 6,
//             "altitude": 235,
//             "longitude": 5.869575049733621,
//             "heading": 91.40625,
//             "latitude": 45.64465967476893
//         },
//         "timestamp": 1394788279898
//     }, {
//         "coords": {
//             "speed": 5.4861016273498535,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 235,
//             "longitude": 5.86963213049422,
//             "heading": 95.2734375,
//             "latitude": 45.64465091568012
//         },
//         "timestamp": 1394788280935
//     }, {
//         "coords": {
//             "speed": 5.380503177642822,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 235,
//             "longitude": 5.869714859878523,
//             "heading": 75.5859375,
//             "latitude": 45.64468792178262
//         },
//         "timestamp": 1394788281930
//     }, {
//         "coords": {
//             "speed": 5.276519775390625,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 234,
//             "longitude": 5.869746124377353,
//             "heading": 55.1953125,
//             "latitude": 45.64467706721801
//         },
//         "timestamp": 1394788282909
//     }, {
//         "coords": {
//             "speed": 5.212399482727051,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 232,
//             "longitude": 5.8697939850444625,
//             "heading": 49.5703125,
//             "latitude": 45.64467899505574
//         },
//         "timestamp": 1394788284221
//     }, {
//         "coords": {
//             "speed": 5.174651622772217,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 232,
//             "longitude": 5.869789123540623,
//             "heading": 18.984375,
//             "latitude": 45.64469378911484
//         },
//         "timestamp": 1394788284924
//     }, {
//         "coords": {
//             "speed": 5.211904525756836,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 232,
//             "longitude": 5.869806222623093,
//             "heading": 10.1953125,
//             "latitude": 45.64473896757294
//         },
//         "timestamp": 1394788286251
//     }, {
//         "coords": {
//             "speed": 5.254780292510986,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 233,
//             "longitude": 5.86982952431391,
//             "heading": 18.6328125,
//             "latitude": 45.64478381075491
//         },
//         "timestamp": 1394788286927
//     }, {
//         "coords": {
//             "speed": 5.329030513763428,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 232,
//             "longitude": 5.869875792419417,
//             "heading": 33.75,
//             "latitude": 45.644830078860416
//         },
//         "timestamp": 1394788288221
//     }, {
//         "coords": {
//             "speed": 5.384955883026123,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 232,
//             "longitude": 5.869927508761985,
//             "heading": 46.7578125,
//             "latitude": 45.64486025371183
//         },
//         "timestamp": 1394788288935
//     }, {
//         "coords": {
//             "speed": 5.309582233428955,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 232,
//             "longitude": 5.869972854858143,
//             "heading": 47.109375,
//             "latitude": 45.644890596201314
//         },
//         "timestamp": 1394788290178
//     }, {
//         "coords": {
//             "speed": 5.250724792480469,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.870029265066488,
//             "heading": 46.40625,
//             "latitude": 45.644932673355235
//         },
//         "timestamp": 1394788290890
//     }, {
//         "coords": {
//             "speed": 5.3057990074157715,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.870077712466819,
//             "heading": 39.375,
//             "latitude": 45.644970224281444
//         },
//         "timestamp": 1394788291884
//     }, {
//         "coords": {
//             "speed": 5.431822299957275,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.870133116846783,
//             "heading": 43.59375,
//             "latitude": 45.6450097449549
//         },
//         "timestamp": 1394788292885
//     }, {
//         "coords": {
//             "speed": 5.542125225067139,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.870186509569986,
//             "heading": 43.59375,
//             "latitude": 45.645047421609654
//         },
//         "timestamp": 1394788294100
//     }, {
//         "coords": {
//             "speed": 5.647174835205078,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.870246104901535,
//             "heading": 42.890625,
//             "latitude": 45.645093647805645
//         },
//         "timestamp": 1394788295157
//     }, {
//         "coords": {
//             "speed": 5.735793590545654,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 230,
//             "longitude": 5.870298156520231,
//             "heading": 42.5390625,
//             "latitude": 45.64514368776758
//         },
//         "timestamp": 1394788296124
//     }, {
//         "coords": {
//             "speed": 5.809989929199219,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 230,
//             "longitude": 5.870346436282499,
//             "heading": 43.59375,
//             "latitude": 45.64519154843469
//         },
//         "timestamp": 1394788296960
//     }, {
//         "coords": {
//             "speed": 5.877871036529541,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 228,
//             "longitude": 5.87034755932109,
//             "heading": 42.75193405151367,
//             "latitude": 45.645270362475216
//         },
//         "timestamp": 1394788298177
//     }, {
//         "coords": {
//             "speed": 5.937166690826416,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 228,
//             "longitude": 5.870402806867787,
//             "heading": 42.75193405151367,
//             "latitude": 45.645312142096095
//         },
//         "timestamp": 1394788298898
//     }, {
//         "coords": {
//             "speed": 6.071393966674805,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 229,
//             "longitude": 5.870464520921814,
//             "heading": 43.183074951171875,
//             "latitude": 45.64535851937182
//         },
//         "timestamp": 1394788299897
//     }, {
//         "coords": {
//             "speed": 6.329115390777588,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 230,
//             "longitude": 5.8705368384107715,
//             "heading": 43.183074951171875,
//             "latitude": 45.645412389093565
//         },
//         "timestamp": 1394788300957
//     }, {
//         "coords": {
//             "speed": 6.581554889678955,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 229,
//             "longitude": 5.870600162706978,
//             "heading": 43.183074951171875,
//             "latitude": 45.64545955929912
//         },
//         "timestamp": 1394788302211
//     }, {
//         "coords": {
//             "speed": 6.605470180511475,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 230,
//             "longitude": 5.870657211053185,
//             "heading": 43.183074951171875,
//             "latitude": 45.64550205482465
//         },
//         "timestamp": 1394788302917
//     }, {
//         "coords": {
//             "speed": 6.623170375823975,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 229,
//             "longitude": 5.870713613403495,
//             "heading": 43.183074951171875,
//             "latitude": 45.64554406917767
//         },
//         "timestamp": 1394788303929
//     }, {
//         "coords": {
//             "speed": 6.645580768585205,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 229,
//             "longitude": 5.870773011629353,
//             "heading": 43.183074951171875,
//             "latitude": 45.64558831489415
//         },
//         "timestamp": 1394788304902
//     }, {
//         "coords": {
//             "speed": 6.663600444793701,
//             "accuracy": 5,
//             "altitudeAccuracy": 4,
//             "altitude": 229,
//             "longitude": 5.87083890910435,
//             "heading": 43.183074951171875,
//             "latitude": 45.645637401898654
//         },
//         "timestamp": 1394788306035
//     }, {
//         "coords": {
//             "speed": 6.664675712585449,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 229,
//             "longitude": 5.870890033475007,
//             "heading": 43.183074951171875,
//             "latitude": 45.64567548463474
//         },
//         "timestamp": 1394788307080
//     }, {
//         "coords": {
//             "speed": 6.6489081382751465,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 228,
//             "longitude": 5.870943189474929,
//             "heading": 43.183074951171875,
//             "latitude": 45.645715080460064
//         },
//         "timestamp": 1394788308211
//     }, {
//         "coords": {
//             "speed": 6.551820755004883,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 228,
//             "longitude": 5.871005613698799,
//             "heading": 43.183074951171875,
//             "latitude": 45.64576158014743
//         },
//         "timestamp": 1394788308904
//     }, {
//         "coords": {
//             "speed": 6.467689514160156,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 229,
//             "longitude": 5.871058030061249,
//             "heading": 43.183074951171875,
//             "latitude": 45.64580062501799
//         },
//         "timestamp": 1394788310161
//     }, {
//         "coords": {
//             "speed": 6.3997955322265625,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 229,
//             "longitude": 5.871062579208228,
//             "heading": 43.183074951171875,
//             "latitude": 45.64580401381376
//         },
//         "timestamp": 1394788310957
//     }, {
//         "coords": {
//             "speed": 5.799798488616943,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 230,
//             "longitude": 5.8710817079554545,
//             "heading": 43.183074951171875,
//             "latitude": 45.64581826277647
//         },
//         "timestamp": 1394788312036
//     }, {
//         "coords": {
//             "speed": 4.424941062927246,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 230,
//             "longitude": 5.871121835629857,
//             "heading": 175.4296875,
//             "latitude": 45.645828271551544
//         },
//         "timestamp": 1394788312951
//     }, {
//         "coords": {
//             "speed": 4.3496222496032715,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.8710026017471595,
//             "heading": 176.484375,
//             "latitude": 45.645752236602775
//         },
//         "timestamp": 1394788315227
//     }, {
//         "coords": {
//             "speed": 5.076380252838135,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 232,
//             "longitude": 5.871189236646398,
//             "heading": 176.1328125,
//             "latitude": 45.64553692475487
//         },
//         "timestamp": 1394788316970
//     }, {
//         "coords": {
//             "speed": 5.102786064147949,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.871200384577616,
//             "heading": 171.2109375,
//             "latitude": 45.64548554368843
//         },
//         "timestamp": 1394788317965
//     }, {
//         "coords": {
//             "speed": 4.705626964569092,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.871210945775612,
//             "heading": 164.1796875,
//             "latitude": 45.645453105723156
//         },
//         "timestamp": 1394788318956
//     }, {
//         "coords": {
//             "speed": 4.378190040588379,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 231,
//             "longitude": 5.87124749087344,
//             "heading": 126.2109375,
//             "latitude": 45.645433282522156
//         },
//         "timestamp": 1394788320197
//     }, {
//         "coords": {
//             "speed": 4.208680152893066,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 233,
//             "longitude": 5.871283365419014,
//             "heading": 125.859375,
//             "latitude": 45.6454103999265
//         },
//         "timestamp": 1394788320894
//     }, {
//         "coords": {
//             "speed": 4.072604179382324,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 233,
//             "longitude": 5.871314043184622,
//             "heading": 103.359375,
//             "latitude": 45.645410819021656
//         },
//         "timestamp": 1394788322169
//     }, {
//         "coords": {
//             "speed": 3.7680623531341553,
//             "accuracy": 5,
//             "altitudeAccuracy": 6,
//             "altitude": 234,
//             "longitude": 5.871355114510163,
//             "heading": 92.4609375,
//             "latitude": 45.645418111277415
//         },
//         "timestamp": 1394788322898
//     }, {
//         "coords": {
//             "speed": 3.537794351577759,
//             "accuracy": 10,
//             "altitudeAccuracy": 6,
//             "altitude": 234,
//             "longitude": 5.871393922721847,
//             "heading": 92.4609375,
//             "latitude": 45.64541693781097
//         },
//         "timestamp": 1394788323968
//     }, {
//         "coords": {
//             "speed": 3.3741507530212402,
//             "accuracy": 10,
//             "altitudeAccuracy": 6,
//             "altitude": 234,
//             "longitude": 5.8714455552453835,
//             "heading": 75.5859375,
//             "latitude": 45.645444011358215
//         },
//         "timestamp": 1394788324896
//     }, {
//         "coords": {
//             "speed": 3.3729660511016846,
//             "accuracy": 10,
//             "altitudeAccuracy": 6,
//             "altitude": 235,
//             "longitude": 5.87150791660498,
//             "heading": 70.3125,
//             "latitude": 45.64547209073384
//         },
//         "timestamp": 1394788325971
//     }, {
//         "coords": {
//             "speed": 3.463883876800537,
//             "accuracy": 10,
//             "altitudeAccuracy": 6,
//             "altitude": 235,
//             "longitude": 5.871554352348551,
//             "heading": 70.3125,
//             "latitude": 45.64548374157925
//         },
//         "timestamp": 1394788327122
//     }, {
//         "coords": {
//             "speed": 3.5247886180877686,
//             "accuracy": 10,
//             "altitudeAccuracy": 6,
//             "altitude": 235,
//             "longitude": 5.871567260479435,
//             "heading": 67.1484375,
//             "latitude": 45.645496733529164
//         },
//         "timestamp": 1394788328164
//     }, {
//         "coords": {
//             "speed": 3.455146551132202,
//             "accuracy": 10,
//             "altitudeAccuracy": 6,
//             "altitude": 235,
//             "longitude": 5.871608583262071,
//             "heading": 68.90625,
//             "latitude": 45.64550293613751
//         },
//         "timestamp": 1394788328985
//     }, {
//         "coords": {
//             "speed": 3.382997989654541,
//             "accuracy": 10,
//             "altitudeAccuracy": 8,
//             "altitude": 236,
//             "longitude": 5.871640518313154,
//             "heading": 78.75,
//             "latitude": 45.6454965658911
//         },
//         "timestamp": 1394788329900
//     }, {
//         "coords": {
//             "speed": 3.242330312728882,
//             "accuracy": 10,
//             "altitudeAccuracy": 8,
//             "altitude": 236,
//             "longitude": 5.871667759498462,
//             "heading": 92.4609375,
//             "latitude": 45.64548562750746
//         },
//         "timestamp": 1394788331120
//     }, {
//         "coords": {
//             "speed": 3.074465274810791,
//             "accuracy": 10,
//             "altitudeAccuracy": 8,
//             "altitude": 236,
//             "longitude": 5.871691312646374,
//             "heading": 110.0390625,
//             "latitude": 45.645468402696444
//         },
//         "timestamp": 1394788332219
//     }]
// function simulate() {
//     let coordinates = Array.from(simulationData);

//     const first = coordinates.shift();
//     simulatePositionChange(first);

//     let prevDate = first.timestamp;
//     function geolocate() {
//         const position = coordinates.shift();
//         if (!position) {
//             coordinates = Array.from(simulationData);
//             geolocate()
//         }
//         const newDate = position.timestamp;
//         simulatePositionChange(position);
//         window.setTimeout(
//             function () {
//                 prevDate = newDate;
//                 geolocate();
//             },
//             (newDate - prevDate),
//         );
//     }
//     geolocate();
// }
// function simulatePositionChange(position) {
//     const coords = position.coords;
//     geolocation.set('accuracy', coords.accuracy);
//     geolocation.set('heading', degToRad(coords.heading));
//     const projectedPosition = fromLonLat([coords.longitude, coords.latitude]);
//     geolocation.set('position', projectedPosition);
//     geolocation.set('speed', coords.speed);
//     geolocation.changed();
// }
// simulate()