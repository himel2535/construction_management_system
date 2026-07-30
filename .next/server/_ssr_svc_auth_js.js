"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "_ssr_svc_auth_js";
exports.ids = ["_ssr_svc_auth_js"];
exports.modules = {

/***/ "(ssr)/./svc_auth.js":
/*!*********************!*\
  !*** ./svc_auth.js ***!
  \*********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   getCurrentUser: () => (/* binding */ getCurrentUser),\n/* harmony export */   getCurrentUserEmail: () => (/* binding */ getCurrentUserEmail),\n/* harmony export */   getCurrentUserId: () => (/* binding */ getCurrentUserId),\n/* harmony export */   getCurrentUserName: () => (/* binding */ getCurrentUserName),\n/* harmony export */   setCurrentUser: () => (/* binding */ setCurrentUser)\n/* harmony export */ });\n/** Current session user (set after /auth/me or login). */ let currentUser = null;\nfunction setCurrentUser(user) {\n    currentUser = user;\n}\nfunction getCurrentUser() {\n    return currentUser;\n}\nfunction getCurrentUserId() {\n    return currentUser?.id ?? \"unknown\";\n}\nfunction getCurrentUserName() {\n    return currentUser?.name ?? currentUser?.email ?? \"User\";\n}\nfunction getCurrentUserEmail() {\n    return currentUser?.email ?? \"\";\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9zdmNfYXV0aC5qcyIsIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFBLHdEQUF3RCxHQUV4RCxJQUFJQSxjQUFjO0FBRVgsU0FBU0MsZUFBZUMsSUFBSTtJQUNqQ0YsY0FBY0U7QUFDaEI7QUFFTyxTQUFTQztJQUNkLE9BQU9IO0FBQ1Q7QUFFTyxTQUFTSTtJQUNkLE9BQU9KLGFBQWFLLE1BQU07QUFDNUI7QUFFTyxTQUFTQztJQUNkLE9BQU9OLGFBQWFPLFFBQVFQLGFBQWFRLFNBQVM7QUFDcEQ7QUFFTyxTQUFTQztJQUNkLE9BQU9ULGFBQWFRLFNBQVM7QUFDL0IiLCJzb3VyY2VzIjpbIi9Vc2Vycy9tb253YXJob3NzYW5oaW1lbC9EZXNrdG9wL2NvbnN0cnVjdGlvbl9tYW5hZ2VtZW50X3N5c3RlbS9zdmNfYXV0aC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiogQ3VycmVudCBzZXNzaW9uIHVzZXIgKHNldCBhZnRlciAvYXV0aC9tZSBvciBsb2dpbikuICovXG5cbmxldCBjdXJyZW50VXNlciA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRDdXJyZW50VXNlcih1c2VyKSB7XG4gIGN1cnJlbnRVc2VyID0gdXNlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEN1cnJlbnRVc2VyKCkge1xuICByZXR1cm4gY3VycmVudFVzZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDdXJyZW50VXNlcklkKCkge1xuICByZXR1cm4gY3VycmVudFVzZXI/LmlkID8/IFwidW5rbm93blwiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3VycmVudFVzZXJOYW1lKCkge1xuICByZXR1cm4gY3VycmVudFVzZXI/Lm5hbWUgPz8gY3VycmVudFVzZXI/LmVtYWlsID8/IFwiVXNlclwiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3VycmVudFVzZXJFbWFpbCgpIHtcbiAgcmV0dXJuIGN1cnJlbnRVc2VyPy5lbWFpbCA/PyBcIlwiO1xufVxuIl0sIm5hbWVzIjpbImN1cnJlbnRVc2VyIiwic2V0Q3VycmVudFVzZXIiLCJ1c2VyIiwiZ2V0Q3VycmVudFVzZXIiLCJnZXRDdXJyZW50VXNlcklkIiwiaWQiLCJnZXRDdXJyZW50VXNlck5hbWUiLCJuYW1lIiwiZW1haWwiLCJnZXRDdXJyZW50VXNlckVtYWlsIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/./svc_auth.js\n");

/***/ })

};
;