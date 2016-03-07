$(function () {
    var server = io.connect(window.location.href);

    $('table').tablesort();
    $("thead th:contains('Date')").data('sortBy', function(th, td, tablesort) {
        return new Date(td.text());
    });

    $('#table').click(function (e) {
        e.stopPropagation();
    });
    $('#cell-form').submit(function (e) {
        e.preventDefault();
        var $td = $('td.active');
        var key = $td.parent().attr('data-key');
        var col = $td.closest('table').find('th').eq($td.index()).html();
        var val = $('#cell-edit').find('input').val();
        var data = {key: key, col: col, val: val};
        var dataJSON = JSON.stringify(data);
        console.log("sending 'update table cell' " + dataJSON);
        server.emit('update table cell', dataJSON);
    });
    $('body').click(function (e) {
        $('td').removeClass('active');
        $('#cell-edit').addClass('disabled').find('input').val('');
        $('#cell-ok').addClass('disabled');
    });
    $('#new-row').click(function (e) {
        var row = {};
        $('th').each(function(){
            row[$(this).html()] = "";
        });
        var rowJSON = JSON.stringify(row);
        console.log("sending 'new table row' " + rowJSON);
        server.emit('new table row', rowJSON);
    });

    var tdOnClick = function (e) {
        $('td').removeClass('active');
        $(this).addClass('active');
        $('#cell-edit').removeClass('disabled').find('input').focus().val($(this).html());
        $('#cell-ok').removeClass('disabled');
    };

    server.on('connect', function () {
        console.log('established new connection to server, clearing local table');
        $('tbody').html('');
        console.log("sending 'request all' to server");
        server.emit("request all");
    });
    server.on('update table cell', function (dataJSON) {
        console.log("received 'update table cell' " + dataJSON);
        var data = JSON.parse(dataJSON);
        var index = $('th:contains(' + data.col + ')').index();
        $('tr[data-key="' + data.key + '"]').find('td').eq(index).html(data.val);
    });
    server.on('new table row', function (rowJSON) {
        console.log("received 'new table row' " + rowJSON);
        var row = JSON.parse(rowJSON);
        var $tr = $('<tr data-key="' + row.key + '"></tr>');
        $('th').each(function(){
            var $td = $('<td>' + row.data[$(this).html()] + '</td>');
            $td.click(tdOnClick);
            $tr.append($td);
        });
        $('table').append($tr);
    });
});
