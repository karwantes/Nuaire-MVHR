"""Constants for the Nuaire MVHR integration."""

DOMAIN = "nuaire_mvhr"
CONF_PORT = "port"

BAUD = 115200          # VSC console
POLL_SECONDS = 20
REPLY_TIMEOUT = 8      # seconds; a command line ends with "sleep 2" before the poll
NO_REPLY = 3           # polls with no answer before the entities go unavailable
