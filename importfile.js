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
        console.log(hex(binary));
        //drawCanvas(src);
        //paletteColor(binary);
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
      var h = ("0"+s.charCodeAt(i).toString(16)).substr(-2);
      result += h;
    }
    return result;
  }