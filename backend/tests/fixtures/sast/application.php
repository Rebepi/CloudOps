<?php
function unsafe_sql($connection) {
    $value = $_GET['name'];
    $sql = "SELECT * FROM users WHERE name = '" . $value . "'";
    mysqli_query($connection, $sql);
}

function safe_sql($connection) {
    $statement = mysqli_prepare($connection, "SELECT * FROM users WHERE name = ?");
    mysqli_stmt_bind_param($statement, "s", $_GET['name']);
    mysqli_stmt_execute($statement);
}

function unsafe_command() {
    shell_exec($_GET['command']);
}

function unsafe_deserialize() {
    unserialize($_POST['payload']);
}
