trim() {
  local var="$*"
  local old_var=""
  while [ "$var" != "$old_var" ]; do
    old_var="$var"
    var="${var#"${var%%[![:space:]]*}"}"
    var="${var%"${var##*[![:space:]]}"}"
    var="${var#\'}"
    var="${var%\'}"
    var="${var#\"}"
    var="${var%\"}"
  done
  printf "%s" "$var"
}
trim "\" hello \""
