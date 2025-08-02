// Authentication utility functions
class Auth {
    static isAuthenticated() {
        const userInfo = sessionStorage.getItem('userInfo');
        return userInfo !== null;
    }

    static getCurrentUser() {
        const userInfo = sessionStorage.getItem('userInfo');
        if (userInfo) {
            try {
                return JSON.parse(userInfo);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    static setUser(user) {
        sessionStorage.setItem('userInfo', JSON.stringify(user));
    }

    static logout() {
        sessionStorage.removeItem('userInfo');
        localStorage.removeItem('userInfo');
        window.location.href = 'login.html';
    }

    static requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    static checkAuthOnPageLoad() {
        // Kiểm tra khi trang được load
        if (!this.isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Auth;
} 