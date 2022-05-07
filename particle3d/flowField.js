// Thanks to P5.js for the noise function :)
var PERLIN_YWRAPB = 4;
var PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
var PERLIN_ZWRAPB = 8;
var PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
var PERLIN_SIZE = 4095;
var perlin_octaves = 4; // default to medium smooth
var perlin_amp_falloff = 0.5; // 50% reduction/octave

var scaled_cosine = function scaled_cosine(i) {
    return 0.5 * (1.0 - Math.cos(i * Math.PI));
};

let perlin;

function noise(x) {
    var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

    perlin = new Array(PERLIN_SIZE + 1);
    for (var i = 0; i < PERLIN_SIZE + 1; i++) {
        perlin[i] = Math.random();
    }

    if (x < 0) {
        x = -x;
    }
    if (y < 0) {
        y = -y;
    }
    if (z < 0) {
        z = -z;
    }

    var xi = Math.floor(x),
        yi = Math.floor(y),
        zi = Math.floor(z);
    var xf = x - xi;
    var yf = y - yi;
    var zf = z - zi;
    var rxf, ryf;

    var r = 0;
    var ampl = 0.5;

    var n1, n2, n3;

    for (var o = 0; o < perlin_octaves; o++) {
        var of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);

        rxf = scaled_cosine(xf);
        ryf = scaled_cosine(yf);

        n1 = perlin[of & PERLIN_SIZE];
        n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
        n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
        n1 += ryf * (n2 - n1);

        of += PERLIN_ZWRAP;
        n2 = perlin[of & PERLIN_SIZE];
        n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
        n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
        n2 += ryf * (n3 - n2);

        n1 += scaled_cosine(zf) * (n2 - n1);

        r += n1 * ampl;
        ampl *= perlin_amp_falloff;
        xi <<= 1;
        xf *= 2;
        yi <<= 1;
        yf *= 2;
        zi <<= 1;
        zf *= 2;

        if (xf >= 1.0) {
            xi++;
            xf--;
        }
        if (yf >= 1.0) {
            yi++;
            yf--;
        }
        if (zf >= 1.0) {
            zi++;
            zf--;
        }
    }
    return r;
};

function generate3DFlowField(fieldWidth, iteration=0, maxForce=1) {
    let flowField = new Array(fieldWidth)
    for (let i = 0; i < fieldWidth; i++) {
        flowField[i] = new Array(fieldWidth)
        for (let j = 0; j < fieldWidth; j++) {
            flowField[i][j] = new Array(fieldWidth)
            for (let k = 0; k < fieldWidth; k++) {
                let forces = new Array(3)
                forces[0] = noise(i + iteration) * maxForce
                forces[1] = noise(i + j + iteration) * maxForce
                forces[2] = noise(i + j + k + iteration) * maxForce
                flowField[i][j][k] = forces
            }
        }
    }
    //Display vector layers
    // let res = ""
    // for (let i = 0; i < fieldWidth; i++) {
    //     for (let j = 0; j < fieldWidth; j++) {
    //         for (let k = 0; k < fieldWidth; k++) {
    //             res += flowField[i][j][k] + "\t"
    //         }
    //         res += "\n"
    //     }
    //     res += "\n\n"
    // }
    
    // console.log(res)
    
    return flowField
    
}
function fullscreen() {
    
    let canvas = document.getElementById('webgl-canvas');
    canvas.requestFullscreen();
}


let displayed = false;
function displayParameters(mouseEvent) {
    let overlay = document.getElementById('overlay');
    displayed = !displayed;
    if (displayed == false){
        overlay.style.display = "none";
    }else{
        overlay.style.display = "block";
        overlay.style.left = mouseEvent.pageX + "px"
        overlay.style.top = mouseEvent.pageY + "px"
    }
    
}