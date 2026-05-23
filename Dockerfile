FROM node:18-alpine

# Install curl in case we need it for debugging/healthchecks
RUN apk add --no-cache curl

# Create application directory
WORKDIR /app

# Copy package configuration
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY src/ ./src/

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
