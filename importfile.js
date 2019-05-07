window.onload = function(){

document.getElementById("file").addEventListener("change", function (e) {
    var file = e.target.files;
    var reader = new FileReader();
    //ファイルが複数読み込まれた際に、1つめを選択
    reader.readAsDataURL(file[0]);
    //ファイルが読み込めたら
    reader.onload = function () {
        var src = reader.result;
        var binary = atob(src.split(',')[1]);
        //console.log(binary.slice(0,8).split('').map(x=>x.codePointAt(0)));
        //console.log([137,80,78,71,13,10,26,10].map(x=>String.fromCharCode(x)).join(''));
        // tostringして結果比較(怪しい)
        if(binary.slice(0,8) === [137,80,78,71,13,10,26,10].map(x=>String.fromCharCode(x)).join('')){
            console.log('this is PNG file');
        }else{
            console.log('this is not PNG file');
        }
        console.log(binary.slice(0,26).split('').map(x=>x.codePointAt(0)));
        //drawCanvas(src);
        //paletteColor(binary);
        if(binary.charCodeAt(25) === 3){
            console.log('this PNG supported');
        }else{
            console.log('this PNG not supported')
        }
    };
}, false);
}

function drawCanvas(source) {
    var canvas = document.getElementById('canvas');
    if (canvas.getContext) {
        var context = canvas.getContext('2d');
        var image = new Image();
        image.src = source;
        image.onload = function () {
            canvas.width = image.width;
            canvas.height = image.height;
            context.drawImage(image, 0, 0);
        };
    }
}
function paletteColor(source) {
    var length = -1;
    var iChankType = -1;

}

function hex(s) {
    var result="";
    for(var i=0;i<s.length;++i){
      var h = ("0"+s.charCodeAt(i).toString(16)).slice(-2);
      result += h;
    }
    return result;
  }