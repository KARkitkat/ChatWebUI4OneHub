FROM php:7.3-fpm

# Install MySQL drivers for PDO (fixes "could not find driver")
RUN docker-php-ext-install pdo_mysql mysqli

# 注入 DB 环境变量，使 Web 请求中 getenv('DB_HOST') 等可用
COPY docker/php/zz-docker.conf /usr/local/etc/php-fpm.d/zz-docker.conf
# 放宽运行限制，避免 put_chat 等大请求超时/OOM 导致 502
COPY docker/php/zz-runtime.ini /usr/local/etc/php/conf.d/zz-runtime.ini

WORKDIR /var/www/html
