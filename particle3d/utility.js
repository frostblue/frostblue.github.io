/**
 * @file Utility.js contains basic functionnalities to help develop a WebGL 2.0 application
 * @author Christophe Bolinhas
 * @description This file will be upgraded until the end of the "Infographie" course around April 2018
 */
/**
 * Creates and compiles a shader based on his code and type
 * @param {WebGL2RenderingContext} glContext - The WebGL context
 * @param {string} source - The source of the shader
 * @param {GLenum} type - The type of shader to compile
 * @returns {WebGLShader} - The compiled shader
 */
function createShader(glContext, source, type) {

    //Creates the shader
    let shader = glContext.createShader(type);
    //Loads in the shader code
    glContext.shaderSource(shader, source);
    //Dynamically compiles it
    glContext.compileShader(shader);
    let success = glContext.getShaderParameter(shader, glContext.COMPILE_STATUS);
    if (success) {
        return shader;
    }
    console.log(glContext.getShaderInfoLog(shader));
    glContext.deleteShader(shader);
}


/**
 * Creates a program based on a vertex and fragment shader source
 * @param {WebGL2RenderingContext} glContext - The WebGL context
 * @param {string} vertexShaderSource - The source of the vertex shader
 * @param {string} fragmentShaderSource - The source of the fragment shader
 * @returns {WebGLProgram} - The program composed of 2 shaders
 */
function createProgram(glContext, vertexShaderSource, fragmentShaderSource) {
    //Creates a new program
    let program = glContext.createProgram();
    //Calls a compilation of the vertex shader
    let vshader = createShader(glContext, vertexShaderSource, glContext.VERTEX_SHADER);
    //Calls a compilation of the fragment shader
    let fshader = createShader(glContext, fragmentShaderSource, glContext.FRAGMENT_SHADER);
    //Copies the vertex shader to the program
    glContext.attachShader(program, vshader);
    //The shader being copied, it can be deleted
    glContext.deleteShader(vshader);
    //Copies the fragment shader into the program
    glContext.attachShader(program, fshader);
    //The shader being copied, it can be deleted
    glContext.deleteShader(fshader);
    //We link the new program to the WebGL context
    glContext.linkProgram(program);

    //Retrives and logs in console the logs from the program creation
    let log = glContext.getProgramInfoLog(program);
    if (log && log !== "\n\n\n") {
        console.log(log);
    }
    //Retrives and logs in console the logs from the vertex shader creation
    log = glContext.getShaderInfoLog(vshader);
    if (log) {
        console.log(log);
    }
    //Retrives and logs in console the logs from the fragment shader creation
    log = glContext.getShaderInfoLog(fshader);
    if (log) {
        console.log(log);
    }
    return program;
}

// /**
//  * Initialize a texture from an image
//  * @param glContext - The webGL context
//  * @param filename - The image file path
//  * @param texture - The array of WebGLTexture where to add the new texture
//  */
// function initTextureWithImage(glContext, filename, texture) {
//     let index = texture.length;
//     texture[index] = glContext.createTexture();
//
//     texture[index].image = new Image();
//     texture[index].image.addEventListener('load', function () {
//         glContext.bindTexture(glContext.TEXTURE_2D, texture[index]);
//         glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, true);
//         glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, texture[index].image);
//         glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.NEAREST);
//         glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.NEAREST);
//         glContext.generateMipmap(glContext.TEXTURE_2D);
//         glContext.bindTexture(glContext.TEXTURE_2D, null);
//     });
//
//     texture[index].image.src = filename;
//
//     // let's use a canvas to make textures, with by default a random color (red, green, blue)
//     // This texture will be used until the image is loaded
//     let random = () => Math.floor(Math.random() * 256);
//
//     let textureCanvas = document.createElement("canvas");
//     textureCanvas.width = 64;
//     textureCanvas.height = 64;
//     let ctx = textureCanvas.getContext("2d");
//     let red = random();
//     let green = random();
//     let blue = random();
//     ctx.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";
//     ctx.fillRect(0, 0, 64, 64);
//
//     glContext.bindTexture(glContext.TEXTURE_2D, texture[index]);
//     glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, textureCanvas);
//     glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.NEAREST);
//     glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.NEAREST);
//     glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
//     glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);
// }

/**
 * Convert degrees to radians
 * @param d - the value in degrees
 * @returns {number} - The value in radians
 */
degToRad = d => d * Math.PI / 180;
