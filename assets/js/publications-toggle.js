// Publications toggle functionality
document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('togglePublications');
  
  if (toggleButton) {
    let isExpanded = false;
    
    toggleButton.addEventListener('click', function() {
      const hiddenPublications = document.querySelectorAll('.publication-hidden');
      const icon = this.querySelector('i');
      
      if (isExpanded) {
        // Verstecke die Publikationen wieder
        hiddenPublications.forEach(function(pub) {
          pub.style.display = 'none';
        });
        icon.className = 'fas fa-angle-down';
        this.innerHTML = '<i class="fas fa-angle-down"></i> Alle anzeigen (' + 
          (hiddenPublications.length + 5) + ')';
        isExpanded = false;
      } else {
        // Zeige alle Publikationen
        hiddenPublications.forEach(function(pub) {
          pub.style.display = 'block';
        });
        icon.className = 'fas fa-angle-up';
        this.innerHTML = '<i class="fas fa-angle-up"></i> Weniger anzeigen';
        isExpanded = true;
      }
    });
  }
});
