// ******************************************************************************************
// *****                                                                                *****
// *****            Programme de calcul des positions et des vitesse                    *****
// *****                                                                                *****

// ******************************************************************************************
var vertexShaderUpdate = `#version 300 es

#ifdef GL_ES
precision highp float;
#endif

in vec2 quad;
out vec2 index;

/**
    * Caclul de la position d'un des sommets d'un carré de la même taille que le canevas.
    * La carte graphique va faire une interpolation sur l'index.
    * Le fragment shader pourra récupérer l'index de la particule associé à son fragment.
    */
void main()
{
    index = (quad + 1.0) / 2.0;
    gl_Position = vec4(quad, 0, 1);
}
`;

var fragmentShaderUpdate = `#version 300 es

#ifdef GL_ES
precision highp float;
precision highp sampler3D;
#endif

uniform int compute_position;
uniform int enable_gravity;
uniform int particles_count;

uniform float time_delta;

uniform sampler2D positions;
uniform sampler2D velocities;
uniform sampler3D flow_field;

in vec2 index;


// shader's output
out vec4 result;

const float PI = 3.14;

const float fieldSize = 100.0; // FIXME hardcoded value

// given a particle's position and its velocity, returns
// the new position of that particle
vec3 next_position(vec3 position, vec3 velocity)
{
    const float max_speed = 60.0; // FIXME make it a uniform

    // move the particle
    vec3 new_position = position + velocity * time_delta * max_speed;

    // warp particles on the other side if they get out of bounds
    new_position.x = mod(new_position.x, fieldSize);
    new_position.y = mod(new_position.y, fieldSize);
    new_position.z = mod(new_position.z, fieldSize); // FIXME

    return new_position;
}

float get_distance(vec3 position1, vec3 position2)
{
    float deltay = (position1.y - position2.y);
    float deltax = (position1.x - position2.x);
    float deltaz = (position1.z - position2.z);

    return sqrt(deltax * deltax + deltay * deltay + deltaz * deltaz);
}

// gravitational force and direction from position1 towards position2
// as a single vector
vec3 gravitational_force_between(vec3 position1, vec3 position2)
{
    float weight = 1.0;

    float distance = get_distance(position1, position2);
    float strength = (weight * 10.f) / distance;

    float dx = position2.x - position1.x;
    float dy = position2.y - position1.y;
    float dz = position2.z - position1.z;

    vec3 direction = vec3(dx, dy, dz);
    return normalize(direction) * strength;
}

// proportionally accelerate (or slow down) towards the target
vec3 next_velocity(vec3 particle_position, vec3 current_velocity)
{    
    vec3 gravity = vec3(0.0, -0.02, 0.0);
    vec3 target_velocity = (texture(flow_field, particle_position / fieldSize).xyz - 0.5) * 2.0;
    vec3 delta = target_velocity - current_velocity;
    vec3 acceleration = delta / 20.0;
    return current_velocity + acceleration + gravity;
}

void main()
{
    vec3 current_position = texture(positions, index).xyz;
    vec3 current_velocity = texture(velocities, index).xyz;

    if (compute_position == 1)
    {
        result = vec4(next_position(current_position, current_velocity), 0.f);
    }
    else
    {
        if (enable_gravity == 1)
            result = vec4(next_velocity(current_position, current_velocity), 0.f);
        else
            result = vec4(current_velocity * 0.98, 0.f);
    }   
}
`;

// ******************************************************************************************
// *****                                                                                *****
// *****                    Programme de dessin des particules                          *****
// *****                                                                                *****
// ******************************************************************************************
var vertexShaderDraw = `#version 300 es

#ifdef GL_ES
precision highp float;
#endif

uniform mat4 mvp;

uniform sampler2D positions;
uniform sampler2D velocities;
uniform vec2 texture_size;
uniform float particle_size;

out float speed;
out float depth;

void main()
{
    vec4 psample = texture(positions, vec2(gl_VertexID % int(texture_size.x), int(gl_VertexID) / int(texture_size.x)) / texture_size);
    vec4 vsample = texture(velocities, vec2(gl_VertexID % int(texture_size.x), int(gl_VertexID) / int(texture_size.x)) / texture_size);

    vec3 world_position = psample.xyz;
    vec4 projection_position = vec4(world_position, 1.0) * mvp;

    gl_Position = projection_position;

    // use the homogenous coordinate to determine the size since it's related to the distance, FIXME I'm not sure how though
    // but the code below seems to work so eh?
    gl_PointSize = particle_size * 0.5 + (100.0 - projection_position.w) * 0.05;

    speed = length(vsample.xyz);
    depth = 1.f;
}
`;

var fragmentShaderDraw = `#version 300 es

#ifdef GL_ES
precision highp float;
#endif

in float speed;
in float depth;

out vec4 out_color;

// dessine le canevas à l'écran.
void main()
{   
    out_color = vec4(clamp(speed, 0.f, 1.f), 1.f - clamp(speed, 0.f, 1.f), 1.f, 1.f) * depth;
}
`;

// ******************************************************************************************
// *****                                                                                *****
// *****                  Programme du rendu des vecteurs du champ                      *****
// *****                                                                                *****
// ******************************************************************************************

let vertexShaderFieldDraw = `#version 300 es

#ifdef GL_ES
precision highp float;
precision highp sampler3D;
#endif

uniform mat4 mvp;
uniform sampler3D flow_field;

out vec3 color;

void main()
{
    // Wisdom words: If GL_POINTS you want to draw, gl_PointSize you must define, or else you'll be wondering for 20 minutes why there's nothing on the screen
    gl_PointSize = 4.f;

    // compute the position of the vector in the flow field based on the vertex ID. The order doesn't really matter
    const int FIELD_SIZE = 10; // FIXME hardcoded, use an uniform instead
    const float WORLD_SIZE = 100.f; // FIXME hardcoded use an uniform instead

    // if the vertex ID is even then it means we're starting to draw the line, so compute its base position
    bool is_vecbase = (gl_VertexID % 2) == 0; 
    int vector_id = gl_VertexID / 2;

    // index coordinates
    int ix = vector_id % FIELD_SIZE;
    int iy = vector_id / (FIELD_SIZE * FIELD_SIZE);
    int iz = (vector_id / FIELD_SIZE) % FIELD_SIZE;

    // normalized coordinates in the "middle" of the cube represented by the texture
    vec3 coords = (vec3(float(ix), float(iy), float(iz)) + 0.5) / float(FIELD_SIZE);

    // if we're not drawing the base of the vector, also add the vector's direction from the vector field
    
    // vector base color
    color = vec3(0.f, 1.f, 0.f);
    if (!is_vecbase)
    {
        // vector as used in the physics shader (WARNING: needs to be the exact same formula, important!)
        vec3 raw_vector = (texture(flow_field, coords).xyz - 0.5) * 2.0;

        // vector tip modified to be displayed properly in this shader
        vec3 field_vector = raw_vector * 2.0 / WORLD_SIZE;
        
        coords = coords + field_vector;
        color = vec3(0.f, 0.f, 0.f); // vector tip color
    }

    gl_Position = vec4(coords * WORLD_SIZE, 1.f) * mvp;
}
`;

let fragmentShaderFieldDraw = `#version 300 es

#ifdef GL_ES
precision highp float;
#endif


in vec3 color;
out vec4 out_color;

void main()
{   
    out_color = vec4(color, 0.f);
}
`;

// Variables pour le stockage des informations nécessaires aux variables passées en attribut.
var quad = [];
var velocities = [];
var quadBuffer = null;

// Paramètres pour la gestion des deux programmes contenant les shaders.
var progList = [];
var ptr = new Object();
var rttFrameBuffer = null;
var rttTextureTab = [];
var nonUpdatedParticlesTextureIndex = 0;
var updatedParticlesTextureIndex = 1;
var nonUpdatedVelocitiesTextureIndex = 2;
var updatedVelocitiesTextureIndex = 3;
var updatedMode = 0; // 1 => calcul des positions, 0 => calcul des vitesses
var enableGravity = 0;
var enableSortedDisplay = 0;

/**
 * lance l'initialisation de toute les textures nécessaires.
 */
function initTextures()
{
    initParticulesTexture();
    initBlankTexture();
}

/**
 * Initialise les textures de position et de vitesse d'un particule à l'aide d'un tableau où des particules sont placées aléatoirement et d'un autre dans lequel des vitesses aléatoires sont placées.
 */
function initParticulesTexture() {
    // tableaux des positions et vitesses
    var rgbaP = new Float32Array(t_width * t_height * 4);
    var rgbaV = new Float32Array(t_width * t_height * 4);
    var i, px, py;
    for (var y = 0; y < t_height; y++)
    {
        for (var x = 0; x < t_width; x++)
        {
            // chaque particule prends 4 emplacement du tableau car chaque valeur (position et vitesse) est codée sur 4 bytes
            i = y * t_width * 4 + x * 4;
            px = Math.random() * 100.0; // FIXME le 100 est hardcodé, pas bien
            py = Math.random() * 100.0;
            pz = Math.random() * 100.0;
            
            vx = (Math.random() * 1.0 - 0.5) * 0.01;
            vy = (Math.random() * 1.0 - 0.5) * 0.01;
            vz = (Math.random() * 1.0 - 0.5) * 0.01;
            
            rgbaP[i + 0] = px;
            rgbaP[i + 1] = py;
            rgbaP[i + 2] = pz;

            rgbaV[i + 0] = vx;
            rgbaV[i + 1] = vy;
            rgbaV[i + 2] = vz;
        }
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rttTextureTab[updatedParticlesTextureIndex]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, t_width, t_height, 0, gl.RGBA, gl.FLOAT, rgbaP);

	gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rttTextureTab[updatedVelocitiesTextureIndex]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, t_width, t_height, 0, gl.RGBA, gl.FLOAT, rgbaV);
}

/**
 * Initialise deux texture vide, pour les textures de positions et de vitesse non update.
 */
function initBlankTexture()
{
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rttTextureTab[nonUpdatedParticlesTextureIndex]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, t_width, t_height, 0, gl.RGBA, gl.FLOAT, null);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rttTextureTab[nonUpdatedVelocitiesTextureIndex]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, t_width, t_height, 0, gl.RGBA, gl.FLOAT, null);
}

/**
 * Fonction de rendu.
 */

let drawVectors = false;
function drawScene()
{
    let fps = computeFps();

    // FIXME probably put keyboard related events elsewhere, maybe register a callback to our internal key management?
    if (oneShotKey('+')) {
        changeParticlesCount(2);
    }
    if (oneShotKey('-')) {
        changeParticlesCount(0.5);
    }
    
    if (oneShotKey('g')) {
        enableGravity = !enableGravity;
    }

    // FIXME please don't judge this code I was just trying stuff out :(
    if (oneShotKey('1')) {
        changeParticleSize(1);
    }
    if (oneShotKey('2')) {
        changeParticleSize(2);
    }
    if (oneShotKey('3')) {
        changeParticleSize(3);
    }
    if (oneShotKey('4')) {
        changeParticleSize(4);
    }
    if (oneShotKey('5')) {
        changeParticleSize(5);
    }
    if (oneShotKey('6')) {
        changeParticleSize(6);
    }
    if (oneShotKey('f')) {
        drawVectors = !drawVectors;
    }

    // regenerate flow field
    if (oneShotKey('r')) {
        generateFlowField();
    }
    
    // ******************************************************************************************
    // *****                                                                                *****
    // *****                    Calcul des positions des particules                         *****
    // *****                                                                                *****
    // ******************************************************************************************

    gl.disable(gl.BLEND);
    gl.useProgram(progList[0]);
    // set le viewport pour lui dire quelle est la taille de la surface de rendu
    gl.viewport(0, 0, t_width, t_height);
    
    updatedMode=1;
    
    gl.uniform1f(ptr.uTimeDelta, 1.0 / fps);
    gl.uniform1i(ptr.uComputePosition0, updatedMode);
    gl.uniform1i(ptr.uEnableGravity, enableGravity);
    gl.uniform1i(ptr.uNbParticles, particleCount);

    // Le framebuffer est lié au context pour rendre dessus et la texture non mise à jour des positions est liée au frambuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFrameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rttTextureTab[nonUpdatedParticlesTextureIndex], 0);

    // La texture mise à jour des particules est copiée dans la zone mémoire du GPU pointée par uPositions0.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rttTextureTab[updatedParticlesTextureIndex]);
    gl.uniform1i(ptr.uPositions0, 0);

    // La texture mise à jour des vitesses est copiée dans la zone mémoire du GPU pointée par uVelocities0
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rttTextureTab[updatedVelocitiesTextureIndex]);
    gl.uniform1i(ptr.uVelocities0, 1);

    // texture 3D flowfield
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, flowField3DTexture);
    gl.uniform1i(ptr.uFlowField0, 2);

    // Instanciation des autres paramètres des shaders.
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.vertexAttribPointer(ptr.aQuad0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2fv(ptr.uCanevasSize0, canevasSize);

    // Le mode de dessin TRIANGLE_STRIP permet l'interpolation de la variable index intern aux shaders.
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, quad.length / 2);

    // ******************************************************************************************
    // *****                                                                                *****
    // *****                    Calcul des vitesses des particules                          *****
    // *****                                                                                *****
    // ******************************************************************************************

    updatedMode=0;

    gl.uniform1i(ptr.uComputePosition0, updatedMode);
    gl.uniform1i(ptr.uEnableGravity, enableGravity);
    gl.uniform1i(ptr.uNbParticles, particleCount);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFrameBuffer);
    // définir où dessiner, ici dans la texture des vitesses
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rttTextureTab[nonUpdatedVelocitiesTextureIndex], 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, quad.length / 2);

    swichtTexturesIndex();

    // ******************************************************************************************
    // *****                                                                                *****
    // *****                               Inter-rendu                                      *****
    // *****                                                                                *****
    // ******************************************************************************************

    // Le framebuffer est enlevé du contexte. Le rendu se fera dans le canevas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // clear le contenu du canevas ainsi que le depth buffer pour avoir un écran vide
    gl.clearColor(0, 0.1, 0.2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ******************************************************************************************
    // *****                                                                                *****
    // *****                        Dessine sur le canevas                                  *****
    // *****                                                                                *****
    // ******************************************************************************************

    // pour quand il y a beaucoup de particules les unes sur les autres, les faire se mélanger en blanc
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);    

    // utiliser le programme de dessin (le 2ème donc)
    gl.useProgram(progList[1]);
    gl.viewport(0, 0, c_width, c_height); // viewport = coordonnées et taille de l'écran

    // La texture mise à jour par le programme précedent est copiée dans la variable uPositions1.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rttTextureTab[updatedParticlesTextureIndex]);
    gl.uniform1i(ptr.uPositions1, 0);

    // Aussi lier la texture des vitesses pour les effets visuels
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rttTextureTab[updatedVelocitiesTextureIndex]);
    gl.uniform1i(ptr.uVelocities1, 1);

    // Instanciation des autres paramètres des shaders.
    gl.uniform2fv(ptr.uTextureSize1, texture_size);
    gl.uniform2fv(ptr.uCanevasSize1, canevasSize);
    gl.uniform1f(ptr.uParticleSize1, particleSize);

    updateCamera(1 / fps);

    let viewMatrix = mat4.create();
    mat4.lookAt(viewMatrix, camera.position, camera.target, camera.up);

    let perspectiveMatrix = mat4.create()
    mat4.perspective(perspectiveMatrix, Math.PI / 4, c_width / c_height, 0.1, 10000.0);

    let mvp = mat4.create();
    mat4.multiply(mvp, perspectiveMatrix, viewMatrix);

    gl.uniformMatrix4fv(ptr.uMVP1, mvp.length, mvp);

    // Les particules sont dessinés par un point.
    gl.drawArrays(gl.POINTS, 0, particleCount);

    // ******************************************************************************************
    // *****                                                                                *****
    // *****                     Dessine le flowfield sur le canevas                        *****
    // *****                                                                                *****
    // ******************************************************************************************
    
    if (drawVectors) {
        // à ce stade les particules sont déjà affichées sur l'écran, on ne clear donc rien

        gl.useProgram(progList[2]);
        gl.viewport(0, 0, c_width, c_height);

        // réutiliser la matrice MVP calculée pour le programme d'avant
        gl.uniformMatrix4fv(ptr.uMVP2, mvp.length, mvp);

        // demander au programe de dessiner plein de lignes (= 2 points par vecteur du champ, on saura
        // si on dessine son bout ou son origine en fonction de si l'index du vertex est pair ou impair)
        gl.drawArrays(gl.LINES, 0, flowFieldSize * flowFieldSize * flowFieldSize * 2);
    }

    // ask the browser to render the next frame immediately
    requestAnimationFrame(drawScene);
}

/**
 * Echange entre les textures mises à jour et celles non mises à jour.
 */
function swichtTexturesIndex()
{
        if (nonUpdatedParticlesTextureIndex == 0)
        {
            updatedParticlesTextureIndex = 0;
            nonUpdatedParticlesTextureIndex = 1;
        }
        else
        {
            updatedParticlesTextureIndex = 1;
            nonUpdatedParticlesTextureIndex = 0;
        }
        if (nonUpdatedVelocitiesTextureIndex == 2)
        {
            updatedVelocitiesTextureIndex = 2;
            nonUpdatedVelocitiesTextureIndex = 3;
        }
        else
        {
            updatedVelocitiesTextureIndex = 3;
            nonUpdatedVelocitiesTextureIndex = 2;
        }
}

// init all shader programs
function initProgramms()
{

    // particles position and velocity computation
    progList[0] = createProgram(gl,vertexShaderUpdate,fragmentShaderUpdate);

    // particles rendering
    progList[1] = createProgram(gl, vertexShaderDraw, fragmentShaderDraw);

    // vector field rendering
    progList[2] = createProgram(gl, vertexShaderFieldDraw, fragmentShaderFieldDraw);

    initShaderParameters();
}

/**
 * Instanciation des ponts entre les variables glsl et les variables javascript.
 */
function initShaderParameters()
{
    // computation uniforms
    ptr.aQuad0 = gl.getAttribLocation(progList[0], "quad");
    gl.enableVertexAttribArray(ptr.aQuad0);

    ptr.uPositions0 = gl.getUniformLocation(progList[0], "positions");
    ptr.uVelocities0 = gl.getUniformLocation(progList[0], "velocities");
    ptr.uFlowField0 = gl.getUniformLocation(progList[0], "flow_field");
    ptr.uComputePosition0 = gl.getUniformLocation(progList[0], "compute_position");
    ptr.uEnableGravity = gl.getUniformLocation(progList[0], "enable_gravity");
    ptr.uNbParticles = gl.getUniformLocation(progList[0], "particles_count");
    ptr.uTimeDelta = gl.getUniformLocation(progList[0], "time_delta");

    // drawing uniforms
    ptr.uMVP1 = gl.getUniformLocation(progList[1], "mvp");
    ptr.uPositions1 = gl.getUniformLocation(progList[1], "positions");
    ptr.uVelocities1 = gl.getUniformLocation(progList[1], "velocities")
    ptr.uTextureSize1 = gl.getUniformLocation(progList[1], "texture_size");
    ptr.uParticleSize1 = gl.getUniformLocation(progList[1], "particle_size");

    // field drawing uniforms
    ptr.uMVP2 = gl.getUniformLocation(progList[2], 'mvp');
    ptr.uFlowField2 = gl.getUniformLocation(progList[2], "flow_field");
}

/**
 * Créations des buffers et des textures.
 */
function createTexturesAndBuffers()
{
    quadBuffer = gl.createBuffer();
    rttTextureTab = [gl.createTexture(), gl.createTexture(), gl.createTexture(), gl.createTexture()]; // 2 textures for both positions and velocities (double buffer + swap)
}

/**
 * Création du buffer de rendu.
 */
function createFramebuffer()
{
    rttFrameBuffer = gl.createFramebuffer();
}

/**
 * Initialisation des buffers.
 */
function initBuffers()
{
    quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

	// mets les données dans les buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
}

/**
 * Initialisation des composants puis lancement de la boucle de rendu.
 */
let canvas = null;
function initWebGL()
{
	canvas = document.getElementById("webgl-canvas");
    
    gl = canvas.getContext("webgl2", {preserveDrawingBuffer: true});

    gl.getExtension("EXT_color_buffer_float");
    gl.enable(gl.DEPTH_TEST); // performance can be improved by disabling this since it's not really visible anyway


    initParticleSize();

    initProgramms();
    createFramebuffer();
    createTexturesAndBuffers();
    initTextures();
    initBuffers();
    requestAnimationFrame(drawScene);
    initKeyboardListeners();
    initMouseListeners();
    initResizeListeners();

    updateCamera(0);
    
    createFlowField();
}

let c_height;
let c_width;
let canevasSize;
function resizeWebGL(width, height)
{
    canvas.width  = width;
    canvas.height = height;

    c_width = width;
    c_height = height;

    canevasSize = [c_width, c_height]
}

function initResizeListeners()
{
    resizeWebGL(window.innerWidth, window.innerHeight);

    canvas.addEventListener("contextmenu", function(e) {
        displayParameters(e);
        e.preventDefault();
    });

    window.addEventListener("resize", function(e) {
        resizeWebGL(window.innerWidth, window.innerHeight);
    });
}

let flowField3DTexture = null;
function createFlowField()
{
    flowField3DTexture = gl.createTexture();

    generateFlowField();
}

// FIXME attention cette valeur (10) est hardcodée dans le shader, ne pas changer, ou alors
// passer la valeur via un uniform (ou changer ici et dans le shader)
const flowFieldSize = 10;

function generateFlowField()
{
    let flowField = generate3DFlowField(flowFieldSize);
    let maxSpeed = 60.0;

    let index = 0;
    let flowFieldBuffer = new Float32Array(flowFieldSize * flowFieldSize * flowFieldSize * 3);
    for (let x = 0; x < flowFieldSize; x++) {
        for (let y = 0; y < flowFieldSize; y++) {
            for (let z = 0; z < flowFieldSize; z++) {
                for (let c = 0; c < 3; c++) {
                    flowFieldBuffer[index++] = flowField[x][y][z][c];
                }
            }
        }
    }

    gl.bindTexture(gl.TEXTURE_3D, flowField3DTexture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.RGB32F,
        flowFieldSize,
        flowFieldSize,
        flowFieldSize,
        0,
        gl.RGB,
        gl.FLOAT,
        flowFieldBuffer
    );
}

/**
 * Fonction chargeant une texture avec un nom de fichier (était utilisé pour vérifier le fonctionnement de l'affichage des textures)
 */
function initTextureWithImage(sFilename) {
    texture = gl.createTexture();

    texture.image = new Image();
    texture.image.crossOrigin = "use-credentials";
    texture.image.onload = function() {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.FLOAT, texture.image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.generateMipmap(gl.TEXTURE_2D);

        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    texture.image.src = sFilename;

    // let's use a canvas to make textures, with by default a random color (red, green, blue)
    function rnd() {
        return Math.floor(Math.random() * 256);
    }

    var c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    var ctx = c.getContext("2d");
    var red = rnd();
    var green = rnd();
    var blue = rnd();
    ctx.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";

    ctx.fillRect(0, 0, 64, 64);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.FLOAT, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture;
}

/*******************************************
 * Gestion de l'interface utilisateur
 *******************************************/

 let particleCount = 191406; // an actual possible value that's not too small nor too big
 
 var t_width = Math.ceil(Math.sqrt(particleCount));
 var t_height = Math.floor(Math.sqrt(particleCount));
 var texture_size = [t_width, t_height];

// changes current particles count by a given factor
function changeParticlesCount(factor)
{
    var virtualParticleCount = Math.max(1, particleCount * factor);
    t_width = Math.ceil(Math.sqrt(virtualParticleCount));
    t_height = Math.floor(Math.sqrt(virtualParticleCount));
    particleCount = t_width * t_height;
    texture_size = [t_width, t_height];

    //Met à jour l'affiche
    document.getElementById("particleCount").innerHTML = particleCount.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,');

    //Met à jour la taille et le contenu des buffers et textures.
    initTextures();
    initBuffers();
}

/**
 * Modifie la taille du rendu des particules et modifie l'affichage.
 * @param {int} value - Longueur du coté du carré représentant une particule.
 */
let particleSize = 1;
function initParticleSize()
{
    document.getElementById("pSizeSlider").value;
}

function changeParticleSize(value)
{
    particleSize = value;
    document.getElementById("pSize").innerHTML = particleSize;
    document.getElementById("pSizeSlider").value = particleSize;
}

/**
 * Calcul et affiche le nombre d'image affichée par seconde.
 */
let lastDisplayRefreshTime = Date.now();

let lastFrameTime = Date.now();
function computeFps()
{
    timeNow = Date.now();
    timeDelta = timeNow - lastFrameTime;
    fps = 1000.0 / timeDelta;
    lastFrameTime = timeNow;

    let refreshDelta = timeNow - lastDisplayRefreshTime;
    if (refreshDelta >= 250.0) {
        document.getElementById("FPS").innerHTML = Number(fps).toPrecision(2);
        lastDisplayRefreshTime = timeNow;
    }

    return fps;
}

/**
 * enclenche/déclenchela gravité dans le programme toggleWeightTexture
 */
function toggleFlowField()
{
    var checkbox = document.getElementById('flowField');
    if (checkbox.checked == true)
    {
        enableGravity=1;
    }
    else
    {
        enableGravity=0;
    }
}

function toggleGravity()
{
    console.log("Not Implemented yet !")
    /*
    var checkbox = document.getElementById('gravity');
    if (checkbox.checked == true)
    {
        enableGravity=1;
    }
    else
    {
        enableGravity=0;
    }*/

}

/**
 * Camera
 */

let camera = {
    "position" : vec3.fromValues(-5.0, -5.0, -5.0),
    "front" : vec3.create(),
    "target" : vec3.create(),
    "up" : vec3.fromValues(0.0, 1.0, 0.0),

    "yaw" : Math.PI / 4,
    "pitch" : Math.PI / 4,
	
    "speed" : 5.0,
    "sensitivity" : 0.0015 
};

function updateCamera(delta)
{
    camera.yaw += mouse.dx * camera.sensitivity;
    camera.pitch += mouse.dy * camera.sensitivity;

    // must reset since we only receive events and don't loop each frame
    mouse.dx = 0;
    mouse.dy = 0;

    if (camera.pitch > 1.55)
        camera.pitch = 1.55;
    if (camera.pitch < -1.55)
        camera.pitch = -1.55;

    let front = vec3.fromValues(
        Math.cos(camera.yaw) * Math.cos(camera.pitch),
        Math.sin(camera.pitch),
        Math.sin(camera.yaw) * Math.cos(camera.pitch)
    );
    vec3.normalize(camera.front, front);

    forward_diff = vec3.create();
    lateral_diff = vec3.create();

    // FIXME add some way to change this with keys
    let speedMultiplier = 10.0;

    if (keystate['w']) {
        vec3.scale(forward_diff, camera.front, camera.speed * delta * speedMultiplier);
    }
    else if (keystate['s']) {
        vec3.scale(forward_diff, camera.front, -camera.speed * delta * speedMultiplier);
    }

    if (keystate['a']) {
        vec3.cross(lateral_diff, camera.front, camera.up);
        vec3.normalize(lateral_diff, lateral_diff);
        vec3.scale(lateral_diff, lateral_diff, -camera.speed * delta * speedMultiplier);
    }
    else if (keystate['d']) {
        vec3.cross(lateral_diff, camera.front, camera.up);
        vec3.normalize(lateral_diff, lateral_diff);
        vec3.scale(lateral_diff, lateral_diff, camera.speed * delta  * speedMultiplier);
    }
    if (keystate[' ']) {
        camera.position[1] += camera.speed * delta  * speedMultiplier;
    }
    else if (keystate['shift']) {
        camera.position[1] -= camera.speed * delta  * speedMultiplier;
    }

    vec3.add(camera.position, camera.position, lateral_diff);
    
    forward_diff[0] += forward_diff[1] * Math.sin(camera.pitch) * Math.cos(camera.yaw);
	forward_diff[2] += forward_diff[1] * Math.sin(camera.pitch) * Math.sin(camera.yaw);
	forward_diff[1] = 0;

    vec3.add(camera.position, camera.position, forward_diff);
    vec3.add(camera.target, camera.position, camera.front);
}

/**
 * All mouse stuff
 */

function initMouseListeners()
{
    window.addEventListener("mousemove", event => mouseMoved(event.x, -event.y, (event.buttons != 0)));
}

let mouse = {
    "px" : 0.0,
    "py" : 0.0,
    "dx" : 0.0,
    "dy" : 0.0
};

function mouseMoved(x, y, mousePressed)
{
    if (mousePressed) {
        mouse.dx = x - mouse.px;
        mouse.dy = y - mouse.py;
    }

    mouse.px = x;
    mouse.py = y;
}

/**
 * All keyboard input functionality down here
 */

function initKeyboardListeners()
{
    window.addEventListener("keydown", event => keyDown(event.key.toLowerCase()) )
    window.addEventListener("keyup", event => keyUp(event.key.toLowerCase()))  
}

// 1 = key currently down, 0 or undefined otherwise
let keystate = {};
// keys for one shot events, don't access the oneshotkey array directly!
let oneshotkey = {};

function keyDown(key) {
    keystate[key] = 1;
    oneshotkey[key] = 1;
    // console.log(key);
}

function keyUp(key) {
    keystate[key] = 0;
    // oneshotkey is not reset here, so if we accidentally add too many particles the event will still be processed without having to let the key down due to low FPS
}

// "consumes" the pressed key once its state is read, can be used
// for toggles and the likes
function oneShotKey(key)
{
    if (oneshotkey[key]) {
        oneshotkey[key] = 0;
        return 1;
    }
    return 0;
}
