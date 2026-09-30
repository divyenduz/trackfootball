#!/bin/sh

# Generate environment configuration file from environment variables
# Usage: ./generate-env-config.sh

# Output file
OUTPUT_FILE="packages/rw-app/.dev.vars"

# Function to resolve environment variable or show placeholder
resolve_env() {
    var_name="$1"
    value=$(eval echo "\$$var_name")
    if [ -n "$value" ]; then
        echo "$var_name=$value"
    else
        echo "$var_name=<$var_name not set in environment>"
    fi
}

# Generate the configuration file
cat > "$OUTPUT_FILE" << EOF
# Environment Configuration
# Generated on $(date)
$(resolve_env "BETTER_AUTH_URL")
$(resolve_env "BACKEND_API")
$(resolve_env "DATABASE_URL")
$(resolve_env "COOKIE_DOMAIN")
$(resolve_env "HOMEPAGE_URL")
$(resolve_env "NO_COLOR")
$(resolve_env "BETTER_AUTH_SECRET")
$(resolve_env "GOOGLE_CLIENT_ID")
$(resolve_env "GOOGLE_CLIENT_SECRET")
$(resolve_env "UNSAFE_AUTH_BYPASS_USER")
EOF

echo "Environment configuration generated in $OUTPUT_FILE"
