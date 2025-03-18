const express = require('express');
const morgan = require('morgan');
const { NODE_ENV } = require('./env');

const configureMiddleware = (app) => {
  // Body parser
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logger
  if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  return app;
};

module.exports = configureMiddleware; 