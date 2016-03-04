$(function () {
    var server = io.connect(window.location.href);

    $('#table').click(function (e) {
        e.stopPropagation();
    });
    $('#cell-form').submit(function (e) {
        e.preventDefault();
        $('td.active').html($('#cell-edit').val());
    });
    $('body').click(function (e) {
        $('td').removeClass('active');
    });
    $('#new-row').click(function (e) {
        var row = {date: "", account: "", category: "", description: "", notes: ""};
        var rowJSON = JSON.stringify(row);
        console.log("sending 'new table row' to server");
        server.emit('new table row', rowJSON);
    });

    var tdOnClick = function (e) {
        $('td').removeClass('active');
        $(this).addClass('active');
        $('#cell-edit').val($(this).html());
    };

    server.on('connect', function () {
        console.log('established new connection to server, clearing local grocery list');
        console.log("sending 'request all' to server");
        server.emit("request all");
    });
    server.on('update grocery item', function (groceryUpdateJSON) {
        console.log("received 'update grocery item' " + groceryUpdateJSON);
    });
    server.on('new table row', function (rowJSON) {
        console.log("received 'new table row' " + rowJSON);
        var row = JSON.parse(rowJSON);
        var $date = $('<td>' + row.data.date + '</td>');
        $date.click(tdOnClick);
        var $account = $('<td>' + row.data.account + '</td>');
        $account.click(tdOnClick);
        var $category = $('<td>' + row.data.category + '</td>');
        $category.click(tdOnClick);
        var $description = $('<td>' + row.data.description + '</td>');
        $description.click(tdOnClick);
        var $notes = $('<td>' + row.data.notes + '</td>');
        $notes.click(tdOnClick);
        var $tr = $('<tr></tr>');
        $tr.append($date, $account, $category, $description, $notes);
        $('table').append($tr);
    });
});
