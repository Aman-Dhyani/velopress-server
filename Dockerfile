# Use Node.js 20 base image
FROM node:20

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --production

# Copy source code
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Start your app
CMD ["npm", "start"]
